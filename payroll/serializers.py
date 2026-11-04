from rest_framework import serializers

from .models import PayrollSettings


class PayrollSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = PayrollSettings
        fields = (
            "working_days_per_month",
            "standard_hours_per_day",
            "overtime_multiplier",
            "pay_auto_closed_shifts",
        )

    def validate_working_days_per_month(self, value):
        if not 1 <= value <= 31:
            raise serializers.ValidationError("Must be between 1 and 31.")
        return value

    def validate_standard_hours_per_day(self, value):
        if not 1 <= value <= 24:
            raise serializers.ValidationError("Must be between 1 and 24.")
        return value

    def validate_overtime_multiplier(self, value):
        if value < 1:
            raise serializers.ValidationError("Must be at least 1.00.")
        return value
