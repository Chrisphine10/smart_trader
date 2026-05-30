import { Suspense } from "react";
import { AuthForm } from "../../../components/auth-form";
import { AuthShell } from "../../../components/auth-shell";

export default function AdminLoginPage() {
  return <AuthShell><Suspense><AuthForm mode="admin" /></Suspense></AuthShell>;
}
