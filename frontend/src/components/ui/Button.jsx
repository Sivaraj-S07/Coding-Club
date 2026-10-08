const variants = {
  primary: "ev-button-primary", secondary: "ev-button-secondary", ghost: "ev-button-ghost",
  danger: "ev-button-danger", success: "ev-button-success",
};
const sizes = { sm: "text-xs px-3 py-2 gap-1.5", md: "text-sm px-4 py-2.5 gap-2", lg: "text-base px-6 py-3.5 gap-2.5" };

export default function Button({
  children,
  variant = "primary",
  size = "md",
  icon: Icon,
  className = "",
  ...props
}) {
  return (
    <button
      className={`ev-button inline-flex items-center justify-center font-medium transition-all duration-200 disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {Icon && <Icon className="h-4 w-4" strokeWidth={2.25} />}
      {children}
    </button>
  );
}
