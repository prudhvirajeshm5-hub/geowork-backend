from rest_framework import serializers, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import EmployeeSerializer

MAX_PHOTO_BYTES = 5 * 1024 * 1024  # 5 MB


def _my_employee(request):
    return getattr(request.user, "employee_profile", None)


class PhotoUploadSerializer(serializers.Serializer):
    photo = serializers.ImageField()


class MyEmployeeProfileView(APIView):
    """The signed-in employee's own profile."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        employee = _my_employee(request)
        if employee is None:
            return Response({"detail": "No employee profile for this account."}, status=404)
        return Response(EmployeeSerializer(employee, context={"request": request}).data)


class MyPhotoView(APIView):
    """Set (POST, multipart field 'photo') or remove (DELETE) the signed-in employee's photo."""

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        employee = _my_employee(request)
        if employee is None:
            return Response({"detail": "No employee profile for this account."}, status=404)

        serializer = PhotoUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        upload = serializer.validated_data["photo"]
        if upload.size > MAX_PHOTO_BYTES:
            return Response({"detail": "Photo must be 5 MB or smaller."}, status=400)

        if employee.photo:
            employee.photo.delete(save=False)
        employee.photo = upload
        employee.save(update_fields=["photo", "updated_at"])
        return Response({"photo": request.build_absolute_uri(employee.photo.url)})

    def delete(self, request):
        employee = _my_employee(request)
        if employee is None:
            return Response({"detail": "No employee profile for this account."}, status=404)
        if employee.photo:
            employee.photo.delete(save=False)
        employee.photo = None
        employee.save(update_fields=["photo", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)
