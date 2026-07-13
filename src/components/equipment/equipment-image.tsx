import Image from "next/image";
import { getEquipmentImage } from "@/lib/equipment-images";

export function EquipmentImage({ name, className = "" }: { name: string; className?: string }) {
  return (
    <Image
      src={getEquipmentImage(name)}
      alt={`ภาพ ${name}`}
      width={320}
      height={220}
      unoptimized
      className={`object-contain ${className}`}
    />
  );
}
