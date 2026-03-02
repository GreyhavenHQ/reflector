import importlib

from reflector.settings import settings


class AudioPaddingAutoProcessor:
    _registry = {}

    @classmethod
    def register(cls, name, kclass):
        cls._registry[name] = kclass

    def __new__(cls, name: str | None = None, **kwargs):
        if name is None:
            name = settings.PADDING_BACKEND
        if name not in cls._registry:
            module_name = f"reflector.processors.audio_padding_{name}"
            importlib.import_module(module_name)

        # gather specific configuration for the processor
        # search `PADDING_XXX_YYY`, push to constructor as `xxx_yyy`
        config = {}
        name_upper = name.upper()
        settings_prefix = "PADDING_"
        config_prefix = f"{settings_prefix}{name_upper}_"
        for key, value in settings:
            if key.startswith(config_prefix):
                config_name = key[len(settings_prefix) :].lower()
                config[config_name] = value

        return cls._registry[name](**config | kwargs)
