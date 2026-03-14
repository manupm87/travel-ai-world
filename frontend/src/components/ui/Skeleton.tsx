
/**
 * Loading Skeleton Primitive.
 * 
 * Provides a generic pulsing placeholder block used to build loading states
 * while asynchronous data is being fetched. Uses the `--color-bg-card` token.
 */
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
