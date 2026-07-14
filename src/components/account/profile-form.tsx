"use client";

import { Camera, LoaderCircle, Mail, Phone, Save, UserRound } from "lucide-react";
import NextImage from "next/image";
import { ChangeEvent, FormEvent, useState } from "react";
import type { AccountProfile } from "@/lib/account-service";

export function ProfileForm({ profile }: { profile: AccountProfile }) {
  const [firstName, setFirstName] = useState(profile.firstName);
  const [lastName, setLastName] = useState(profile.lastName);
  const [phone, setPhone] = useState(profile.phone);
  const [gmail, setGmail] = useState(profile.gmail);
  const [image, setImage] = useState(profile.profileImage);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
      setMessage("กรุณาเลือกรูปภาพขนาดไม่เกิน 5 MB");
      event.target.value = "";
      return;
    }
    setMessage("");
    const source = new window.Image();
    const reader = new FileReader();
    reader.onload = () => {
      source.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 128;
        const context = canvas.getContext("2d");
        if (!context) return;
        const size = Math.min(source.width, source.height);
        context.drawImage(source, (source.width - size) / 2, (source.height - size) / 2, size, size, 0, 0, 128, 128);
        setImage(canvas.toDataURL("image/jpeg", 0.65));
      };
      source.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const response = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName, lastName, phone, gmail, profileImage: image }),
    });
    const data = (await response.json()) as { error?: string };
    setLoading(false);
    setMessage(response.ok ? "บันทึกโปรไฟล์เรียบร้อยแล้ว" : data.error || "บันทึกไม่สำเร็จ");
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex justify-center">
        <label className="relative cursor-pointer">
          <span className="grid size-24 place-items-center overflow-hidden rounded-full bg-blue-100 text-blue-600 ring-4 ring-white shadow-lg">
            {image ? <NextImage src={image} alt="รูปโปรไฟล์" width={96} height={96} unoptimized className="size-24 object-cover" /> : <UserRound className="size-10" />}
          </span>
          <span className="absolute bottom-0 right-0 grid size-9 place-items-center rounded-full bg-blue-600 text-white">
            <Camera className="size-4" />
          </span>
          <input type="file" accept="image/*" onChange={chooseImage} className="sr-only" />
        </label>
      </div>

      {message && <p className="rounded-xl bg-blue-50 p-3 text-center text-sm text-blue-700">{message}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
      <label className="block">
        <span className="mb-2 block text-sm font-semibold">ชื่อ</span>
        <input value={firstName} onChange={(event) => setFirstName(event.target.value)} className="h-12 w-full rounded-xl border border-slate-200 px-3" required />
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-semibold">นามสกุล</span>
        <input value={lastName} onChange={(event) => setLastName(event.target.value)} className="h-12 w-full rounded-xl border border-slate-200 px-3" required />
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-semibold">เบอร์โทรศัพท์ติดต่อ</span>
        <div className="relative">
          <Phone className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input value={phone} onChange={(event) => setPhone(event.target.value.replace(/[^\d+ -]/g, "").slice(0, 16))} inputMode="tel" className="h-12 w-full rounded-xl border border-slate-200 pl-10 pr-3" placeholder="0812345678" />
        </div>
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-semibold">Gmail สำหรับกู้คืนบัญชี</span>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input type="email" value={gmail} onChange={(event) => setGmail(event.target.value)} className="h-12 w-full rounded-xl border border-slate-200 pl-10 pr-3" placeholder="example@gmail.com" />
        </div>
      </label>
      </div>

      <button disabled={loading} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-blue-600 font-bold text-white disabled:opacity-60">
        {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
        บันทึกโปรไฟล์
      </button>
    </form>
  );
}
