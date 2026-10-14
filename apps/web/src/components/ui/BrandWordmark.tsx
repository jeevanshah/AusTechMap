interface BrandWordmarkProps {
  className?: string;
}

export function BrandWordmark({ className }: BrandWordmarkProps) {
  return (
    <span className={className}>
      Role<span className="text-terracotta-500">Wide</span>
    </span>
  );
}
