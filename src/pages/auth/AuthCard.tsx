import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Logo } from "../../components/ui";

/** Standalone auth/status page in the same visual language as the sign-in modal. */
export function AuthCard({ title, children, footer, icon }: {
  title: string; children?: ReactNode; footer?: ReactNode; icon?: ReactNode;
}) {
  return (
    <div className="auth">
      <Link to="/" className="auth-logo" aria-label="Senim"><Logo size={30} /></Link>
      <div className="auth-card">
        {icon && <div className="auth-icon">{icon}</div>}
        <h1>{title}</h1>
        {children}
      </div>
      {footer && <div className="auth-footer">{footer}</div>}
    </div>
  );
}
