"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useCallback } from "react";
import { Controller, useForm } from "react-hook-form";

import { ErrorDisplay } from "@/components/ErrorDisplay";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import ROUTES from "@/constants/routes";
import { useAuth } from "@/context/auth-context";
import {
  StudentLoginSchema,
  StaffLoginSchema,
} from "@/features/auth/lib/schema";
import { isApiError } from "@/lib/api/errors";
import type { LoginRequest } from "@/types/auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthFormProps {
  variant: "student" | "staff";
}

type FieldErrors = Record<string, string | undefined>;

// ---------------------------------------------------------------------------
// Config per variant
// ---------------------------------------------------------------------------

const VARIANT_CONFIG = {
  student: {
    redirectPath: ROUTES.WORKSHOPS,
    switchLabel: "Đăng nhập với tư cách BTC",
    switchHref: ROUTES.ADMIN_LOGIN,
    schema: StudentLoginSchema,
  },
  staff: {
    redirectPath: ROUTES.ADMIN,
    switchLabel: "Đăng nhập với tư cách Sinh viên",
    switchHref: ROUTES.LOGIN,
    schema: StaffLoginSchema,
  },
} as const;

// ---------------------------------------------------------------------------
// Error messages
// ---------------------------------------------------------------------------

function getErrorMessage(code: string): string {
  switch (code) {
    case "INVALID_CREDENTIALS":
      return "Thông tin đăng nhập không đúng. Vui lòng kiểm tra lại.";
    case "USER_SUSPENDED":
      return "Tài khoản đã bị khóa. Vui lòng liên hệ ban tổ chức.";
    case "RATE_LIMIT_EXCEEDED":
      return "Quá nhiều lần thử. Vui lòng đợi vài giây và thử lại.";
    default:
      return "Không thể kết nối đến máy chủ. Vui lòng thử lại.";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AuthForm({ variant }: AuthFormProps) {
  const router = useRouter();
  const { login } = useAuth();
  const config = VARIANT_CONFIG[variant];

  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(config.schema),
    mode: "onBlur",
  });

  const typedErrors = errors as Record<
    string,
    { message?: string } | undefined
  >;

  // Merge server field errors with client validation errors for FieldError
  const mergeError = (field: string) => [
    typedErrors[field],
    fieldErrors[field] ? { message: fieldErrors[field] } : undefined,
  ];

  // ---- Submit ----
  const onSubmit = useCallback(
    async (data: unknown) => {
      setServerError(null);
      setFieldErrors({});

      try {
        await login(data as LoginRequest);
        router.push(config.redirectPath);
      } catch (err) {
        if (isApiError(err)) {
          if (err.fieldErrors?.length) {
            const map: FieldErrors = {};
            for (const fe of err.fieldErrors) {
              map[fe.field] = fe.message;
            }
            setFieldErrors(map);
          }
          setServerError(getErrorMessage(err.code));
        } else {
          setServerError(getErrorMessage(""));
        }
      }
    },
    [login, router, config.redirectPath]
  );

  const showStudentId = variant === "student";
  const showEmail = variant === "staff";

  return (
    <form
      data-testid="login-form"
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-4"
      noValidate
    >
      {/* Server error banner */}
      {serverError && <ErrorDisplay error={serverError} variant="banner" />}

      {/* Student ID field (student variant only) */}
      {showStudentId && (
        <Field
          data-invalid={!!typedErrors.studentId || !!fieldErrors.studentId}
        >
          <FieldLabel htmlFor="studentId">MSSV</FieldLabel>
          <FieldContent>
            <Input
              id="studentId"
              type="text"
              placeholder="21127001"
              autoComplete="username"
              disabled={isSubmitting}
              {...register("studentId")}
            />
            <FieldError errors={mergeError("studentId")} />
          </FieldContent>
        </Field>
      )}

      {/* Email field (staff variant only) */}
      {showEmail && (
        <Field data-invalid={!!typedErrors.email || !!fieldErrors.email}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <FieldContent>
            <Input
              id="email"
              type="email"
              placeholder="btc01@unihub.edu.vn"
              autoComplete="email"
              disabled={isSubmitting}
              {...register("email")}
            />
            <FieldError errors={mergeError("email")} />
          </FieldContent>
        </Field>
      )}

      {/* Password field (both variants) */}
      <Field data-invalid={!!typedErrors.password || !!fieldErrors.password}>
        <FieldLabel htmlFor="password">Mật khẩu</FieldLabel>
        <FieldContent>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            disabled={isSubmitting}
            {...register("password")}
          />
          <FieldError errors={mergeError("password")} />
        </FieldContent>
      </Field>

      {/* Hidden accountType — registered via Controller for react-hook-form */}
      <Controller
        name="accountType"
        control={control}
        defaultValue={variant === "student" ? "STUDENT" : "STAFF"}
        render={({ field }) => (
          <input name={field.name} value={field.value} type="hidden" />
        )}
      />

      {/* Submit button */}
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập"}
      </Button>

      {/* Variant switch link */}
      <div className="text-center">
        <a
          href={config.switchHref}
          className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4 transition-colors"
        >
          {config.switchLabel}
        </a>
      </div>
    </form>
  );
}
