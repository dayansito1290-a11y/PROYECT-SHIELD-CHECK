import logo from "../../logo.png";

export function Logo({ className = "h-14 w-auto" }: { className?: string }) {
  return <img src={logo} alt="FieldCheck" className={`object-contain ${className}`} />;
}
