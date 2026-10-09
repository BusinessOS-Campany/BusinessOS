"use client";

import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  BarChart3,
  Contact,
  FileClock,
  FileText,
  Home,
  Layers,
  Package,
  Pill,
  Receipt,
  Settings,
  Shield,
  ShoppingBag,
  ShoppingCart,
  Clock,
  Stethoscope,
  Truck,
  Undo2,
  Users,
  Wallet,
  Calculator,
} from "lucide-react";

export function getIcon(name: string): LucideIcon {
  switch (name) {
    case "Home": return Home;
    case "ShoppingCart": return ShoppingCart;
    case "Pill": return Pill;
    case "Layers": return Layers;
    case "Package": return Package;
    case "Clock": return Clock;
    case "Receipt": return Receipt;
    case "Undo2": return Undo2;
    case "Users": return Users;
    case "ShoppingBag": return ShoppingBag;
    case "Truck": return Truck;
    case "FileText": return FileText;
    case "Stethoscope": return Stethoscope;
    case "Contact": return Contact;
    case "Wallet": return Wallet;
    case "Banknote": return Banknote;
    case "Calculator": return Calculator;
    case "BarChart3": return BarChart3;
    case "Shield": return Shield;
    case "Settings": return Settings;
    case "FileClock": return FileClock;
    default: return Package;
  }
}