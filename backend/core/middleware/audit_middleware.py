import json
import logging
from django.utils import timezone

logger = logging.getLogger('audit')


class AuditMiddleware:
    SKIP_PATHS = ['/api/health/', '/static/', '/media/']
    SKIP_METHODS = ['GET', 'HEAD', 'OPTIONS']

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if (request.method not in self.SKIP_METHODS and
                not any(request.path.startswith(p) for p in self.SKIP_PATHS)):
            actor = getattr(request, 'user', None)
            logger.info(json.dumps({
                'timestamp': timezone.now().isoformat(),
                'actor': getattr(actor, 'email', 'anonymous'),
                'method': request.method,
                'path': request.path,
                'status': response.status_code,
            }))
        return response
