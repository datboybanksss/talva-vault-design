import iconTeal from "@/assets/talvault-icon-teal.png.asset.json";
import iconWhite from "@/assets/talvault-icon-white.png.asset.json";
import wordTeal from "@/assets/talvault-word-teal.png.asset.json";
import wordWhite from "@/assets/talvault-word-white.png.asset.json";
import lockupTeal from "@/assets/talvault-lockup-teal.png.asset.json";
import lockupWhite from "@/assets/talvault-lockup-white.png.asset.json";

export const talvaultLogo = {
  iconTeal: iconTeal.url,
  iconWhite: iconWhite.url,
  wordTeal: wordTeal.url,
  wordWhite: wordWhite.url,
  lockupTeal: lockupTeal.url,
  lockupWhite: lockupWhite.url,
};

type Variant = "teal" | "white";

export function TalVaultIcon({
  variant = "teal",
  className,
  style,
}: {
  variant?: Variant;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <img
      src={variant === "white" ? talvaultLogo.iconWhite : talvaultLogo.iconTeal}
      alt="TalVault"
      className={className}
      style={{ display: "block", objectFit: "contain", ...style }}
    />
  );
}

export function TalVaultWordmark({
  variant = "teal",
  className,
  style,
}: {
  variant?: Variant;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <img
      src={variant === "white" ? talvaultLogo.wordWhite : talvaultLogo.wordTeal}
      alt="TalVault"
      className={className}
      style={{ display: "block", objectFit: "contain", ...style }}
    />
  );
}

export function TalVaultLockup({
  variant = "teal",
  className,
  style,
}: {
  variant?: Variant;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <img
      src={variant === "white" ? talvaultLogo.lockupWhite : talvaultLogo.lockupTeal}
      alt="TalVault"
      className={className}
      style={{ display: "block", objectFit: "contain", ...style }}
    />
  );
}
