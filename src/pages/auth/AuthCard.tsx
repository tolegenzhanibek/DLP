import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { LanguageSwitch } from "../../components/LanguageSwitch";
import { Logo } from "../../components/ui";

export function AuthCard({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="auth">
      <div className="auth-top">
        <Link to="/" className="auth-logo" aria-label="Senim"><Logo size={32} /></Link>
        <LanguageSwitch />
      </div>
      <div className="card auth-card">
        <h1>{title}</h1>
        {children}
      </div>
      {footer && <div className="auth-footer">{footer}</div>}
    </div>
  );
}
