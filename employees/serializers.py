from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from rest_framework import serializers

from accounts.models import Role, User
from accounts.serializers import UserSerializer
from companies.models import Branch, Department, Designation, ShiftTiming

from .models import Employee, EmployeeTransferRequest


class EmployeeSerializer(serializers.ModelSerializer):
    """Read/update serializer — org-structure and HR-profile fields only."""

    user = UserSerializer(read_only=True)
    manager_name = serializers.CharField(source="manager.user.get_full_name", read_only=True, default=None)

    class Meta:
        model = Employee
        fields = (
            "id", "user", "company", "employee_code", "branch", "department",
            "designation", "shift", "manager", "manager_name", "photo",
            "date_of_joining", "date_of_exit", "address",
            "emergency_contact_name", "emergency_contact_phone", "status",
            "created_at", "updated_at",
        )
        read_only_fields = ("id", "company", "status", "created_at", "updated_at")

    def validate(self, attrs):
        company = self.instance.company if self.instance else self.context["request"].user.company
        for field, model in (
            ("branch", Branch), ("department", Department),
            ("designation", Designation), ("shift", ShiftTiming),
        ):
            obj = attrs.get(field)
            if obj and obj.company_id != company.id:
                raise serializers.ValidationError({field: "Does not belong to your company."})
        manager = attrs.get("manager")
        if manager and manager.company_id != company.id:
            raise serializers.ValidationError({"manager": "Does not belong to your company."})
        if self.instance and manager and manager.id == self.instance.id:
            raise serializers.ValidationError({"manager": "An employee cannot be their own manager."})
        return attrs


class EmployeeCreateSerializer(serializers.ModelSerializer):
    """
    Admin-facing 'Add Employee' flow: creates the login User and the
    Employee profile together in one transaction.
    """

    phone = serializers.CharField(write_only=True)
    email = serializers.EmailField(write_only=True, required=False, allow_null=True)
    first_name = serializers.CharField(write_only=True)
    last_name = serializers.CharField(write_only=True, required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, validators=[validate_password])
    role = serializers.ChoiceField(choices=Role.choices, write_only=True, default=Role.EMPLOYEE)

    class Meta:
        model = Employee
        fields = (
            "id", "phone", "email", "first_name", "last_name", "password", "role",
            "employee_code", "branch", "department", "designation", "shift",
            "manager", "photo", "date_of_joining", "address",
            "emergency_contact_name", "emergency_contact_phone",
        )
        read_only_fields = ("id",)

    def validate_role(self, value):
        if value == Role.ADMIN:
            raise serializers.ValidationError("Use the company owner flow to create additional admins.")
        return value

    def validate_phone(self, value):
        if User.objects.filter(phone=value).exists():
            raise serializers.ValidationError("A user with this phone number already exists.")
        return value

    @transaction.atomic
    def create(self, validated_data):
        company = self.context["request"].user.company
        user_fields = {
            "phone": validated_data.pop("phone"),
            "email": validated_data.pop("email", None),
            "first_name": validated_data.pop("first_name"),
            "last_name": validated_data.pop("last_name", ""),
            "role": validated_data.pop("role"),
            "company": company,
        }
        password = validated_data.pop("password")
        user = User(**user_fields)
        user.set_password(password)
        user.save()

        employee = Employee.objects.create(user=user, company=company, **validated_data)
        return employee

    def to_representation(self, instance):
        return EmployeeSerializer(instance, context=self.context).data


class EmployeeStatusSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=["enable", "disable"])


class EmployeeTransferRequestSerializer(serializers.ModelSerializer):
    """Read serializer — shown in transfer history / pending-approval lists."""

    employee_name = serializers.CharField(source="employee.user.get_full_name", read_only=True)
    employee_code = serializers.CharField(source="employee.employee_code", read_only=True)
    from_branch_name = serializers.CharField(source="from_branch.name", read_only=True, default=None)
    to_branch_name = serializers.CharField(source="to_branch.name", read_only=True)
    requested_by_name = serializers.CharField(source="requested_by.get_full_name", read_only=True, default=None)
    approver_name = serializers.CharField(source="approver.user.get_full_name", read_only=True, default=None)
    decided_by_name = serializers.CharField(source="decided_by.get_full_name", read_only=True, default=None)

    class Meta:
        model = EmployeeTransferRequest
        fields = (
            "id", "employee", "employee_name", "employee_code",
            "from_branch", "from_branch_name", "to_branch", "to_branch_name",
            "requested_by", "requested_by_name", "approver", "approver_name",
            "reason", "effective_date", "status",
            "decided_by", "decided_by_name", "decided_at", "decision_note",
            "created_at", "updated_at",
        )
        read_only_fields = fields


class TransferRequestCreateSerializer(serializers.Serializer):
    to_branch = serializers.PrimaryKeyRelatedField(queryset=Branch.objects.all())
    reason = serializers.CharField(required=False, allow_blank=True, default="")
    effective_date = serializers.DateField(required=False, allow_null=True, default=None)


class TransferDecisionSerializer(serializers.Serializer):
    decision_note = serializers.CharField(required=False, allow_blank=True, default="")