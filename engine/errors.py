"""One error type for problems we can explain to the user in plain words."""


class KadrError(Exception):
    """Raised with a friendly message that is safe to show in the UI."""
