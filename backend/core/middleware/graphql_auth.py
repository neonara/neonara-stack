from rest_framework_simplejwt.authentication import JWTAuthentication
from django.contrib.auth.models import AnonymousUser


class GraphQLJWTMiddleware:
    def resolve(self, next, root, info, **args):
        request = info.context
        if not hasattr(request, 'user') or not request.user.is_authenticated:
            try:
                auth = JWTAuthentication()
                result = auth.authenticate(request)
                if result:
                    request.user = result[0]
            except Exception:
                request.user = AnonymousUser()
        return next(root, info, **args)
