export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`bg-bg-card animate-pulse rounded-md ${className || ""}`}
      {...props}
    />
  );
}
