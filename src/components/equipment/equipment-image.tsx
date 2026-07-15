import Image from "next/image";
import { getEquipmentImage } from "@/lib/equipment-images";

export function EquipmentImage({ name, src, className = "" }: { name: string; src?: string; className?: string }) {
  return (
    <Image
      src={src || getEquipmentImage(name)}
      alt={`ภาพ ${name}`}
      width={320}
      height={220}
      unoptimized
      className={`object-contain ${className}`}
    />
  );
}
