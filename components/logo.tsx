import Link from "next/link";

export function Logo({
  href = "/",
  label = "Hydra Trade",
  size = "md",
  hideLabelOnMobile = false,
}: {
  href?: string;
  label?: string;
  size?: "sm" | "md" | "lg";
  hideLabelOnMobile?: boolean;
}) {
  const imageSize = size === "lg" ? "h-12 w-12" : size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const textSize = size === "lg" ? "text-2xl" : "text-[17px]";
  const labelVisibility = hideLabelOnMobile ? "hidden sm:inline" : "";
  return (
    <Link href={href} className="flex items-center gap-2.5">
      <span className={`${imageSize} overflow-hidden rounded-xl shadow-glow ring-1 ring-brand/20`}>
        <img src="/brand/hydra-logo.png" alt="" className="h-full w-full object-contain object-center" />
      </span>
      <span className={`${labelVisibility} ${textSize} font-bold`}>{label}</span>
    </Link>
  );
}
