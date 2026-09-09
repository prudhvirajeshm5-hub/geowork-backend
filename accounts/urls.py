from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from . import views

app_name = "accounts"

urlpatterns = [
    path("register/", views.RegisterView.as_view(), name="register"),
    path("login/", views.PasswordLoginView.as_view(), name="login-password"),
    path("login/otp/request/", views.OTPRequestView.as_view(), name="login-otp-request"),
    path("login/otp/verify/", views.OTPLoginVerifyView.as_view(), name="login-otp-verify"),
    path("password/forgot/", views.ForgotPasswordRequestView.as_view(), name="forgot-password-request"),
    path("password/reset/", views.ForgotPasswordConfirmView.as_view(), name="forgot-password-confirm"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("logout/", views.LogoutView.as_view(), name="logout"),
    path("logout/all/", views.LogoutAllDevicesView.as_view(), name="logout-all-devices"),
    path("password/change/", views.ChangePasswordView.as_view(), name="change-password"),
    path("me/", views.MeView.as_view(), name="me"),
    path("device/", views.DeviceRegistrationView.as_view(), name="device-register"),
]
