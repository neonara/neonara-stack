class CacheKey:
    """All cache keys must be tenant-scoped. Never hardcode key strings."""

    def __init__(self, schema_name: str):
        self.schema = schema_name

    def user_profile(self, user_id: str) -> str:
        return f"{self.schema}:user:{user_id}"

    def tenant_branding(self) -> str:
        return f"{self.schema}:branding"

    @staticmethod
    def public_packs() -> str:
        return "public:packs"
