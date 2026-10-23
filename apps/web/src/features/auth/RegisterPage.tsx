import { PASSWORD_MIN_LENGTH, RegisterInputSchema } from "@summit/shared";
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { TextField } from "../../components/TextField";
import { ApiRequestError } from "../../lib/api";
import { AuthForm } from "./AuthForm";
import { formErrorMessage, serverFieldErrors, validateForm } from "./formErrors";
import { useCurrentUser, useRegister } from "./useAuth";
import { usePageTitle } from "../../lib/usePageTitle";

/** /register: create an account (which also signs you in). */
export function RegisterPage() {
  usePageTitle("Create your account");
  const { user } = useCurrentUser();
  const register = useRegister();
  const navigate = useNavigate();

  const [values, setValues] = useState({ email: "", displayName: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (field: keyof typeof values) => (value: string) =>
    setValues((previous) => ({ ...previous, [field]: value }));

  if (user) return <Navigate to="/" replace />;

  const submit = () => {
    const { data, errors: invalid } = validateForm(RegisterInputSchema, values);
    setErrors(invalid ?? {});
    if (!data) return;
    register.mutate(data, {
      onSuccess: () => void navigate("/", { replace: true }),
      // Server-side field problems (like a taken email) go under their field.
      onError: (error) => setErrors(serverFieldErrors(error)),
    });
  };

  const emailTaken =
    register.error instanceof ApiRequestError && register.error.code === "EMAIL_TAKEN";
  // Field errors show under their inputs; only other problems go on top.
  const formError =
    register.error && Object.keys(serverFieldErrors(register.error)).length === 0
      ? formErrorMessage(register.error)
      : null;

  return (
    <AuthForm
      title="Create your account"
      submitLabel="Create account"
      onSubmit={submit}
      isSubmitting={register.isPending}
      formError={formError}
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-teal-700 underline dark:text-teal-400">
            Sign in
          </Link>
        </>
      }
    >
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        value={values.email}
        onChange={set("email")}
        error={errors.email}
      />
      {emailTaken && (
        <p className="-mt-2 text-sm">
          <Link to="/login" className="font-medium text-teal-700 underline dark:text-teal-400">
            Sign in instead?
          </Link>
        </p>
      )}
      <TextField
        label="Display name"
        name="displayName"
        autoComplete="nickname"
        value={values.displayName}
        onChange={set("displayName")}
        error={errors.displayName}
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        // Tells password managers to suggest a new strong password.
        autoComplete="new-password"
        value={values.password}
        onChange={set("password")}
        error={errors.password}
        hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
      />
    </AuthForm>
  );
}
