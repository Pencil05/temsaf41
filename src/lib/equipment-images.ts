const equipmentImages: Array<{ aliases: string[]; path: string }> = [
  { aliases: ["m16a4"], path: "/M16A4.png" },
  { aliases: ["m4a1"], path: "/M4A1.png" },
  { aliases: ["mp5"], path: "/MP5.png" },
  { aliases: ["m60"], path: "/M60.png" },
  { aliases: ["glock19", "glock"], path: "/Glock 19.png" },
  { aliases: ["เสื้อเกราะกันกระสุน", "เสื้อเกราะ"], path: "/เสื้อเกราะกันกระสุน.png" },
  { aliases: ["หมวกกันกระสุนkevlar", "หมวกกันกระสุน", "kevlar"], path: "/หมวกกันกระสุน (Kevlar).png" },
  { aliases: ["ระเบิดมือm67", "m67"], path: "/ระเบิดมือ M67.png" },
  { aliases: ["รถยนต์บรรทุก", "รถบรรทุก25ตัน"], path: "/รถยนต์บรรทุก 2.5 ตัน.png" },
  { aliases: ["มีดพกประจำกายทหาร", "มีดพก"], path: "/มีดพกประจำกายทหาร.png" },
  { aliases: ["ดาบปลายปืน"], path: "/ดาบปลายปืน.png" },
  { aliases: ["กระเป๋าเป้สนาม", "เป้สนาม"], path: "/กระเป๋าเป้สนาม.png" },
  { aliases: ["กระสุน556มม", "กระสุน556", "556มม"], path: "/กระสุน 5.56 มม..png" },
];

function normalize(value: string) {
  return value.toLocaleLowerCase("th").replace(/[^a-z0-9ก-๙]/g, "");
}

export function getEquipmentImage(name: string) {
  const normalizedName = normalize(name);
  const match = equipmentImages.find((item) => item.aliases.some((alias) => normalizedName.includes(normalize(alias))));
  return match?.path || "/crest-placeholder.svg";
}
