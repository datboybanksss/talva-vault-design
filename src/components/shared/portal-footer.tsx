import { Link } from "@tanstack/react-router";

/**
 * Shared portal footer. Carries the legal links that must stay easily
 * accessible from every page (POPIA s18 transparency).
 */
export function PortalFooter() {
  return (
    <footer className="tvp-portal-footer">
      <span>&copy; {new Date().getFullYear()} TalVault (Pty) Ltd</span>
      <nav aria-label="Legal">
        <Link to="/legal/privacy">Privacy Notice</Link>
      </nav>
    </footer>
  );
}
