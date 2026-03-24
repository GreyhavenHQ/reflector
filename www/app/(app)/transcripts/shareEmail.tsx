import { useState } from "react";
import type { components } from "../../reflector-api";

type GetTranscriptWithParticipants =
  components["schemas"]["GetTranscriptWithParticipants"];
import {
  Button,
  Dialog,
  CloseButton,
  Input,
  Box,
  Text,
} from "@chakra-ui/react";
import { LuMail } from "react-icons/lu";
import { useTranscriptSendEmail } from "../../lib/apiHooks";

type ShareEmailProps = {
  transcript: GetTranscriptWithParticipants;
  disabled: boolean;
};

export default function ShareEmail(props: ShareEmailProps) {
  const [showModal, setShowModal] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const sendEmailMutation = useTranscriptSendEmail();

  const handleSend = async () => {
    if (!email) return;
    try {
      await sendEmailMutation.mutateAsync({
        params: {
          path: { transcript_id: props.transcript.id },
        },
        body: { email },
      });
      setSent(true);
      setTimeout(() => {
        setSent(false);
        setShowModal(false);
        setEmail("");
      }, 2000);
    } catch (error) {
      console.error("Error sending email:", error);
    }
  };

  return (
    <>
      <Button disabled={props.disabled} onClick={() => setShowModal(true)}>
        <LuMail /> Send Email
      </Button>

      <Dialog.Root
        open={showModal}
        onOpenChange={(e) => {
          setShowModal(e.open);
          if (!e.open) {
            setSent(false);
            setEmail("");
          }
        }}
        size="md"
      >
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Send Transcript via Email</Dialog.Title>
              <Dialog.CloseTrigger asChild>
                <CloseButton />
              </Dialog.CloseTrigger>
            </Dialog.Header>
            <Dialog.Body>
              {sent ? (
                <Text color="green.500">Email sent successfully!</Text>
              ) : (
                <Box>
                  <Text mb={2}>
                    Enter the email address to send this transcript to:
                  </Text>
                  <Input
                    type="email"
                    placeholder="recipient@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  />
                </Box>
              )}
            </Dialog.Body>
            <Dialog.Footer>
              <Button variant="ghost" onClick={() => setShowModal(false)}>
                Close
              </Button>
              {!sent && (
                <Button
                  disabled={!email || sendEmailMutation.isPending}
                  onClick={handleSend}
                >
                  {sendEmailMutation.isPending ? "Sending..." : "Send"}
                </Button>
              )}
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Root>
    </>
  );
}
