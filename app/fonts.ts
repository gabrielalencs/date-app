import { Fraunces, Inter } from "next/font/google";

// axes só aceita eixos além do wght, que já vem por padrão. WONK e SOFT ficam
// fora de propósito: sem serem pedidos, permanecem no valor default (desligado).
export const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
  variable: "--font-fraunces",
});

export const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});
