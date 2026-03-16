# === further tests
# FIXME test status of transcript
# FIXME test websocket connection after RTC is finished still send the full events
# FIXME try with locked session, RTC should not work
# TODO: add integration tests for post-processing (LivePostPipeline) with a real
#       Hatchet instance. These tests currently only cover the live pipeline.
#       Post-processing events (WAVEFORM, FINAL_*, DURATION, STATUS=ended, mp3)
#       are now dispatched via Hatchet and tested in test_hatchet_live_post_pipeline.py.

import asyncio
import json
import threading
import time
from pathlib import Path

import pytest
from httpx_ws import aconnect_ws
from uvicorn import Config, Server


class ThreadedUvicorn:
    def __init__(self, config: Config):
        self.server = Server(config)
        self.thread = threading.Thread(daemon=True, target=self.server.run)

    async def start(self):
        self.thread.start()
        timeout_seconds = 600  # 10 minutes
        start_time = time.monotonic()
        while (
            not self.server.started
            and (time.monotonic() - start_time) < timeout_seconds
        ):
            await asyncio.sleep(0.1)
        if not self.server.started:
            raise TimeoutError(
                f"Server failed to start after {timeout_seconds} seconds"
            )

    def stop(self):
        if self.thread.is_alive():
            self.server.should_exit = True
            timeout_seconds = 600  # 10 minutes
            start_time = time.time()
            while (
                self.thread.is_alive() and (time.time() - start_time) < timeout_seconds
            ):
                time.sleep(0.1)
            if self.thread.is_alive():
                raise TimeoutError(
                    f"Thread failed to stop after {timeout_seconds} seconds"
                )


@pytest.fixture
def appserver(tmpdir, setup_database):
    import threading

    from reflector.app import app
    from reflector.db import get_database
    from reflector.settings import settings

    DATA_DIR = settings.DATA_DIR
    settings.DATA_DIR = Path(tmpdir)

    # start server in a separate thread with its own event loop
    host = "127.0.0.1"
    port = 1255
    server_started = threading.Event()
    server_exception = None
    server_instance = None

    def run_server():
        nonlocal server_exception, server_instance
        try:
            # Create a new event loop for this thread
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

            config = Config(app=app, host=host, port=port, loop=loop)
            server_instance = Server(config)

            async def start_server():
                # Initialize database connection in this event loop
                database = get_database()
                await database.connect()
                try:
                    await server_instance.serve()
                finally:
                    await database.disconnect()

            # Signal that server is starting
            server_started.set()
            loop.run_until_complete(start_server())
        except Exception as e:
            server_exception = e
            server_started.set()
        finally:
            loop.close()

    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()

    # Wait for server to start
    server_started.wait(timeout=30)
    if server_exception:
        raise server_exception

    # Wait a bit more for the server to be fully ready
    time.sleep(1)

    yield server_instance, host, port

    # Stop server
    if server_instance:
        server_instance.should_exit = True
        server_thread.join(timeout=30)

    settings.DATA_DIR = DATA_DIR


# Using celery_includes from conftest.py which includes both pipelines


@pytest.mark.usefixtures("setup_database")
@pytest.mark.asyncio
async def test_transcript_rtc_and_websocket(
    tmpdir,
    dummy_llm,
    dummy_transcript,
    dummy_processors,
    dummy_diarization,
    dummy_transcript_translator,
    dummy_storage,
    fake_mp3_upload,
    appserver,
    client,
    monkeypatch,
    mock_hatchet_client,
):
    # goal: start the server, exchange RTC, receive websocket events
    # because of that, we need to start the server in a thread
    # to be able to connect with aiortc
    from reflector.settings import settings

    monkeypatch.setattr(
        settings, "PUBLIC_MODE", True
    )  # public mode: allow anonymous transcript creation for this test

    server, host, port = appserver

    # create a transcript
    base_url = f"http://{host}:{port}/v1"
    response = await client.post("/transcripts", json={"name": "Test RTC"})
    assert response.status_code == 200
    tid = response.json()["id"]

    # create a websocket connection as a task
    events = []

    async def websocket_task():
        print("Test websocket: TASK STARTED")
        async with aconnect_ws(f"{base_url}/transcripts/{tid}/events") as ws:
            print("Test websocket: CONNECTED")
            try:
                timeout_seconds = 600  # 10 minutes
                start_time = time.monotonic()
                while (time.monotonic() - start_time) < timeout_seconds:
                    msg = await ws.receive_json()
                    print(f"Test websocket: JSON {msg}")
                    if msg is None:
                        break
                    events.append(msg)
                else:
                    print(f"Test websocket: TIMEOUT after {timeout_seconds} seconds")
            except Exception as e:
                print(f"Test websocket: EXCEPTION {e}")
            finally:
                ws.close()
                print("Test websocket: DISCONNECTED")

    websocket_task = asyncio.get_event_loop().create_task(websocket_task())
    print("Test websocket: TASK CREATED", websocket_task)

    # create stream client
    import argparse

    from aiortc.contrib.signaling import add_signaling_arguments, create_signaling

    from reflector.stream_client import StreamClient

    parser = argparse.ArgumentParser()
    add_signaling_arguments(parser)
    args = parser.parse_args(["-s", "tcp-socket"])
    signaling = create_signaling(args)

    url = f"{base_url}/transcripts/{tid}/record/webrtc"
    path = Path(__file__).parent / "records" / "test_short.wav"
    stream_client = StreamClient(signaling, url=url, play_from=path.as_posix())
    await stream_client.start()

    timeout = 120
    while not stream_client.is_ended():
        await asyncio.sleep(1)
        timeout -= 1
        if timeout < 0:
            raise TimeoutError("Timeout while waiting for RTC to end")

    # XXX aiortc is long to close the connection
    # instead of waiting a long time, we just send a STOP
    stream_client.channel.send(json.dumps({"cmd": "STOP"}))
    await stream_client.stop()

    # Wait for live pipeline to flush (it dispatches post-processing to Hatchet)
    timeout = 30
    while True:
        resp = await client.get(f"/transcripts/{tid}")
        assert resp.status_code == 200
        if resp.json()["status"] in ("processing", "ended", "error"):
            break
        await asyncio.sleep(1)
        timeout -= 1
        if timeout < 0:
            raise TimeoutError("Timeout waiting for live pipeline to finish")

    # stop websocket task
    websocket_task.cancel()

    # check live pipeline events
    assert len(events) > 0
    from pprint import pprint

    pprint(events)

    eventnames = [e["event"] for e in events]

    # Live pipeline produces TRANSCRIPT and TOPIC events during RTC
    assert "TRANSCRIPT" in eventnames
    ev = events[eventnames.index("TRANSCRIPT")]
    assert ev["data"]["text"].startswith("Hello world.")
    assert ev["data"]["translation"] is None

    assert "TOPIC" in eventnames
    ev = events[eventnames.index("TOPIC")]
    assert ev["data"]["id"]
    assert ev["data"]["summary"] == "LLM SUMMARY"
    assert ev["data"]["transcript"].startswith("Hello world.")
    assert ev["data"]["timestamp"] == 0.0

    # Live pipeline status progression
    statuses = [e["data"]["value"] for e in events if e["event"] == "STATUS"]
    assert "recording" in statuses
    assert "processing" in statuses
    assert statuses.index("recording") < statuses.index("processing")

    # Post-processing (WAVEFORM, FINAL_*, DURATION, mp3, STATUS=ended) is now
    # dispatched to Hatchet via LivePostPipeline — not tested here.
    # See test_hatchet_live_post_pipeline.py for post-processing tests.


@pytest.mark.usefixtures("setup_database")
@pytest.mark.asyncio
async def test_transcript_rtc_and_websocket_and_fr(
    tmpdir,
    dummy_llm,
    dummy_transcript,
    dummy_processors,
    dummy_diarization,
    dummy_transcript_translator,
    dummy_storage,
    fake_mp3_upload,
    appserver,
    client,
    monkeypatch,
    mock_hatchet_client,
):
    # goal: start the server, exchange RTC, receive websocket events
    # because of that, we need to start the server in a thread
    # to be able to connect with aiortc
    # with target french language
    from reflector.settings import settings

    monkeypatch.setattr(
        settings, "PUBLIC_MODE", True
    )  # public mode: allow anonymous transcript creation for this test

    server, host, port = appserver

    # create a transcript
    base_url = f"http://{host}:{port}/v1"
    response = await client.post(
        "/transcripts", json={"name": "Test RTC", "target_language": "fr"}
    )
    assert response.status_code == 200
    tid = response.json()["id"]

    # create a websocket connection as a task
    events = []

    async def websocket_task():
        print("Test websocket: TASK STARTED")
        async with aconnect_ws(f"{base_url}/transcripts/{tid}/events") as ws:
            print("Test websocket: CONNECTED")
            try:
                timeout_seconds = 600  # 10 minutes
                start_time = time.monotonic()
                while (time.monotonic() - start_time) < timeout_seconds:
                    msg = await ws.receive_json()
                    print(f"Test websocket: JSON {msg}")
                    if msg is None:
                        break
                    events.append(msg)
                else:
                    print(f"Test websocket: TIMEOUT after {timeout_seconds} seconds")
            except Exception as e:
                print(f"Test websocket: EXCEPTION {e}")
            finally:
                ws.close()
                print("Test websocket: DISCONNECTED")

    websocket_task = asyncio.get_event_loop().create_task(websocket_task())
    print("Test websocket: TASK CREATED", websocket_task)

    # create stream client
    import argparse

    from aiortc.contrib.signaling import add_signaling_arguments, create_signaling

    from reflector.stream_client import StreamClient

    parser = argparse.ArgumentParser()
    add_signaling_arguments(parser)
    args = parser.parse_args(["-s", "tcp-socket"])
    signaling = create_signaling(args)

    url = f"{base_url}/transcripts/{tid}/record/webrtc"
    path = Path(__file__).parent / "records" / "test_short.wav"
    stream_client = StreamClient(signaling, url=url, play_from=path.as_posix())
    await stream_client.start()

    timeout = 120
    while not stream_client.is_ended():
        await asyncio.sleep(1)
        timeout -= 1
        if timeout < 0:
            raise TimeoutError("Timeout while waiting for RTC to end")

    # XXX aiortc is long to close the connection
    # instead of waiting a long time, we just send a STOP
    stream_client.channel.send(json.dumps({"cmd": "STOP"}))

    await asyncio.sleep(2)

    await stream_client.stop()

    # Wait for live pipeline to flush
    timeout = 30
    while True:
        resp = await client.get(f"/transcripts/{tid}")
        assert resp.status_code == 200
        if resp.json()["status"] in ("processing", "ended", "error"):
            break
        await asyncio.sleep(1)
        timeout -= 1
        if timeout < 0:
            raise TimeoutError("Timeout waiting for live pipeline to finish")

    # stop websocket task
    websocket_task.cancel()

    # check live pipeline events
    assert len(events) > 0
    from pprint import pprint

    pprint(events)

    eventnames = [e["event"] for e in events]

    # Live pipeline produces TRANSCRIPT with translation
    assert "TRANSCRIPT" in eventnames
    ev = events[eventnames.index("TRANSCRIPT")]
    assert ev["data"]["text"].startswith("Hello world.")
    assert ev["data"]["translation"] == "en:fr:Hello world."

    assert "TOPIC" in eventnames
    ev = events[eventnames.index("TOPIC")]
    assert ev["data"]["id"]
    assert ev["data"]["summary"] == "LLM SUMMARY"
    assert ev["data"]["transcript"].startswith("Hello world.")
    assert ev["data"]["timestamp"] == 0.0

    # Live pipeline status progression
    statuses = [e["data"]["value"] for e in events if e["event"] == "STATUS"]
    assert "recording" in statuses
    assert "processing" in statuses
    assert statuses.index("recording") < statuses.index("processing")

    # Post-processing (FINAL_*, STATUS=ended) is now dispatched to Hatchet
    # via LivePostPipeline — not tested here.
