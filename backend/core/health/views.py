from django.db import connection
from django.core.cache import cache
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny


class HealthCheckView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        db_ok = 'ok'
        cache_ok = 'ok'
        try:
            connection.ensure_connection()
        except Exception:
            db_ok = 'error'
        try:
            cache.set('health', '1', 5)
            assert cache.get('health') == '1'
        except Exception:
            cache_ok = 'error'
        status = 'ok' if db_ok == 'ok' and cache_ok == 'ok' else 'error'
        return Response({'status': status, 'db': db_ok, 'cache': cache_ok})
