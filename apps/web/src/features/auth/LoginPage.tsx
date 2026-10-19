import { LoginInputSchema } from "@summit/shared";
import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { TextField } from "../../components/TextField";
import { AuthForm } from "./AuthForm";
import { formErrorMessage, validateForm } from "./formErrors";
import { useCurrentUser, useLogin } from "./useAuth";

/** /login: sign in, then return to the page the user was trying to reach. */
export function LoginPage() {
  const { user } = useCurrentUser();
  const login = useLogin();
  const navigate = useNavigate();
  // Set by RequireAuth when it redirected here from a protected page.
  const from = (useLocation().state as { from?: string } | null)?.from ?? "/";

  const [values, setValues] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (field: keyof typeof values) => (value: string) =>
    setValues((previous) => ({ ...previous, [field]: value }));

  // Already signed in (e.g. pressed Back after logging in): nothing to do here.
  if (user) return <Navigate to={from} replace />;

  const submit = () => {
    const { data, errors: invalid } = validateForm(LoginInputSchema, values);
    setErrors(invalid ?? {});
    if (!data) return;
    login.mutate(data, { onSuccess: () => void navigate(from, { replace: true }) });
  };

  return (
    <AuthForm
      title="Sign in"
      submitLabel="Sign in"
      onSubmit={submit}
      isSubmitting={login.isPending}
      formError={login.error ? formErrorMessage(login.error) : null}
      footer={
        <>
          New to Summit?{" "}
          <Link to="/register" className="font-medium text-teal-700 underline dark:text-teal-400">
            Create an account
          </Link>
        </>
      }
    >
      <TextField
        label="Email"
        name="email"
        type="email"
        // Lets password managers fill and save this login.
        autoComplete="username"
        value={values.email}
        onChange={set("email")}
        error={errors.email}
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        value={values.password}
        onChange={set("password")}
        error={errors.password}
      />
    </AuthForm>
  );
}
