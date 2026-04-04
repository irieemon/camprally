import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { remark } from "remark";
import html from "remark-html";
import { articles } from "@/data/articles";
import { products } from "@/data/products";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft, ExternalLink, Star, Check, TrendingDown,
  Zap, ChevronRight, Compass, Flame
} from "lucide-react";
import Image from "next/image";

interface Props {
  params: Promise<{ slug: string }>;
}

// ─────────────────────────────────────────
// HERO IMAGES — one per article
// ─────────────────────────────────────────
const HERO_IMAGES: Record<string, string> = {
  "best-budget-tents-under-100":         "https://images.unsplash.com/photo-1478827536114-da961b7f86d2?w=1200&q=80",
  "cheapest-camping-setup-for-beginners":"https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=1200&q=80",
  "best-budget-sleeping-bags-cold-weather":"https://images.unsplash.com/photo-1517823382935-51bfcb0ec6bc?w=1200&q=80",
  "budget-camping-cookware-that-works":   "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80",
  "how-to-start-camping-no-gear":         "https://images.unsplash.com/photo-1537905569824-f89f14cceb68?w=1200&q=80",
  "best-budget-sleeping-pads-under-50":   "https://images.unsplash.com/photo-1537905569824-f89f14cceb68?w=1200&q=80",
  "affordable-headlamps-camping":         "https://images.unsplash.com/photo-1510312305653-8ed496ef7575?w=1200&q=80",
  "budget-camp-chairs-that-last":         "https://images.unsplash.com/photo-1551632811-561732d1e306?w=1200&q=80",
  "best-cheap-camping-tables":            "https://images.unsplash.com/photo-1510672981848-a1c4f1cb5ccf?w=1200&q=80",
  "budget-camping-hacks-that-work":       "https://images.unsplash.com/photo-1445308394109-4ec2920981b1?w=1200&q=80",
  "how-to-pack-light-camping":            "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=1200&q=80",
  "best-budget-multitool-camping":        "https://images.unsplash.com/photo-1606744888344-493238951221?w=1200&q=80",
  "affordable-water-filtration-camping":  "https://images.unsplash.com/photo-1530790678709-9a48c3a650f5?w=1200&q=80",
  "budget-portable-camping-stoves-compared":"https://images.unsplash.com/photo-1510672981848-a1c4f1cb5ccf?w=1200&q=80",
  "best-budget-gps-compass-hiking":        "https://images.unsplash.com/photo-1551632811-561732d1e306?w=1200&q=80",
  "how-to-find-free-campsites":           "https://images.unsplash.com/photo-1445308394109-4ec2920981b1?w=1200&q=80",
  "best-budget-camping-knife":            "https://images.unsplash.com/photo-1606744888344-493238951221?w=1200&q=80",
  "affordable-rain-gear-camping":         "https://images.unsplash.com/photo-1510312305653-8ed496ef7575?w=1200&q=80",
  "budget-camping-accessories-under-20":  "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=1200&q=80",
  "best-time-year-camp-free":             "https://images.unsplash.com/photo-1445308394109-4ec2920981b1?w=1200&q=80",
  default: "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=1200&q=80",
};

// ─────────────────────────────────────────
// PRODUCT IMAGE MAP — curated Unsplash per product
// ─────────────────────────────────────────
const PRODUCT_IMAGES: Record<string, string> = {
  "Coleman Sundome":   "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=400&q=80",
  "Coleman Brazos":    "https://images.unsplash.com/photo-1517823382935-51bfcb0ec6bc?w=400&q=80",
  "Klymit Static V":   "https://images.unsplash.com/photo-1537905569824-f89f14cceb68?w=400&q=80",
  "Stanley Adventure": "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400&q=80",
  "Etekcity":          "https://images.unsplash.com/photo-1510672981848-a1c4f1cb5ccf?w=400&q=80",
  "Vont":              "https://images.unsplash.com/photo-1510312305653-8ed496ef7575?w=400&q=80",
  "Nalgene":           "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=400&q=80",
  "Sawyer Squeeze":    "https://images.unsplash.com/photo-1530790678709-9a48c3a650f5?w=400&q=80",
  "LifeStraw":         "https://images.unsplash.com/photo-1530790678709-9a48c3a650f5?w=400&q=80",
  "Trekology":         "https://images.unsplash.com/photo-1510672981848-a1c4f1cb5ccf?w=400&q=80",
  "KingCamp":          "https://images.unsplash.com/photo-1551632811-561732d1e306?w=400&q=80",
  "Gerber Suspension": "https://images.unsplash.com/photo-1606744888344-493238951221?w=400&q=80",
  "Mora Companion":    "https://images.unsplash.com/photo-1606744888344-493238951221?w=400&q=80",
  "Frogg Toggs":       "https://images.unsplash.com/photo-1510312305653-8ed496ef7575?w=400&q=80",
  "Garmin eTrex":      "https://images.unsplash.com/photo-1551632811-561732d1e306?w=400&q=80",
  "Suunto A-10":       "https://images.unsplash.com/photo-1551632811-561732d1e306?w=400&q=80",
  "Black Diamond Spot":"https://images.unsplash.com/photo-1510312305653-8ed496ef7575?w=400&q=80",
  "Teton Sports":      "https://images.unsplash.com/photo-1517823382935-51bfcb0ec6bc?w=400&q=80",
  "Kelty Discovery":   "https://images.unsplash.com/photo-1478827536114-da961b7f86d2?w=400&q=80",
  "Oaskys":           "https://images.unsplash.com/photo-1517823382935-51bfcb0ec6bc?w=400&q=80",
  "default":          "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=400&q=80",
};

// ─────────────────────────────────────────
// PER-ARTICLE CUSTOM SECTIONS
// ─────────────────────────────────────────
interface CustomSection {
  type: "product-grid" | "checklist" | "callout" | "stats" | "spotlight" | "tips" | "table" | "hack-list";
  title?: string;
  subtitle?: string;
  icon?: string;
  items?: Array<{ label: string; detail?: string; note?: string; link?: string; icon?: string; category?: string }>;
  checkItems?: string[];
  calloutType?: "save" | "splurge" | "tip" | "warning";
  calloutTitle?: string;
  calloutBody?: string;
  stats?: Array<{ value: string; label: string }>;
  spotlightItem?: { name: string; price: string; rating: string; why: string; category: string };
  tips?: Array<{ title: string; body: string }>;
  rows?: string[][];
}

const ARTICLE_CUSTOM_SECTIONS: Record<string, CustomSection[]> = {
  "cheapest-camping-setup-for-beginners": [
    {
      type: "stats",
      stats: [
        { value: "$192.93", label: "Total Setup Cost" },
        { value: "7", label: "Items Needed" },
        { value: "2", label: "People" },
        { value: "2", label: "Nights Min." },
      ]
    },
    {
      type: "product-grid",
      title: "The Essential 7 Items",
      subtitle: "You genuinely need just seven things to camp. Everything else is optional.",
      items: [
        { label: "Coleman Sundome 2P Tent", detail: "$49.99", note: "4.4★", category: "Shelter", icon: "⛺", link: "https://www.amazon.com/shop/camprally" },
        { label: "Coleman Brazos 30°F Sleeping Bag", detail: "$24.99", note: "4.3★", category: "Sleeping Bag", icon: "🛏️", link: "https://www.amazon.com/shop/camprally" },
        { label: "Klymit Static V Sleeping Pad", detail: "$44.99", note: "4.5★", category: "Sleeping Pad", icon: "💤", link: "https://www.amazon.com/shop/camprally" },
        { label: "Stanley Adventure Camp Cook Set", detail: "$29.99", note: "4.6★", category: "Cooking", icon: "🍳", link: "https://www.amazon.com/shop/camprally" },
        { label: "Etekcity Ultralight Stove", detail: "$12.99", note: "4.4★", category: "Stove", icon: "🔥", link: "https://www.amazon.com/shop/camprally" },
        { label: "Vont 4-Pack LED Lanterns", detail: "$14.99", note: "4.6★", category: "Lighting", icon: "💡", link: "https://www.amazon.com/shop/camprally" },
        { label: "Nalgene 32oz Water Bottle", detail: "$14.99", note: "4.7★", category: "Water", icon: "💧", link: "https://www.amazon.com/shop/camprally" },
      ]
    },
    {
      type: "callout",
      calloutType: "save",
      calloutTitle: "SAVE: Tent",
      calloutBody: "The $50 Sundome outperforms tents 3x its price in weather protection. Don't overthink this."
    },
    {
      type: "callout",
      calloutType: "splurge",
      calloutTitle: "SPLURGE: Sleeping Bag",
      calloutBody: "Your sleeping bag is the most personal item. The Brazos is decent, but if you camp in colder weather, consider the Teton Sports Celsius (rated to 0°F) for $34.99."
    },
    {
      type: "callout",
      calloutType: "save",
      calloutTitle: "SAVE: Stove",
      calloutBody: "The Etekcity canister stove at $12.99 boils water in 3 minutes. Expensive stoves do the same thing 30 seconds faster. Not worth the money."
    },
    {
      type: "spotlight",
      spotlightItem: {
        name: "Coleman Sundome 2P",
        price: "$49.99",
        rating: "4.4/5",
        why: "The benchmark budget tent. WeatherTec™ system, 10-minute setup, and genuine 2-person capacity. Under $50 and backed by Coleman reliability.",
        category: "Tent"
      }
    },
    {
      type: "checklist",
      title: "First Trip Checklist",
      checkItems: [
        "Tent + rainfly",
        "Sleeping bag + pad",
        "Headlamp + lanterns",
        "Stove + fuel",
        "Water + filtration",
        "Food + cooler",
        "Lighter/matches",
        "First aid kit",
        "Sunscreen",
        "Clothing layers",
      ]
    },
  ],

  "best-budget-tents-under-100": [
    {
      type: "spotlight",
      spotlightItem: {
        name: "Coleman Sundome 2-Person Tent",
        price: "$49.99",
        rating: "4.4/5",
        why: "The king of budget tents. WeatherTec™ system with inverted seams keeps you dry, 10-minute setup, and genuine 2-person capacity. At under $50, nothing else comes close.",
        category: "Tent"
      }
    },
    {
      type: "product-grid",
      title: "Top Picks Under $100",
      items: [
        { label: "Coleman Sundome 2P", detail: "$49.99", note: "4.4★", category: "Top Pick", icon: "🏆", link: "https://www.amazon.com/shop/camprally" },
        { label: "Kelty Discovery Element 4", detail: "$89.99", note: "4.2★", category: "Backpackers", icon: "🎒", link: "https://www.amazon.com/shop/camprally" },
        { label: "Teton Sports Grande 6", detail: "$99.99", note: "4.3★", category: "Families", icon: "👨‍👩‍👧", link: "https://www.amazon.com/shop/camprally" },
        { label: "Core 4-Person Dome", detail: "$79.99", note: "4.1★", category: "Car Camping", icon: "🚗", link: "https://www.amazon.com/shop/camprally" },
      ]
    },
    {
      type: "tips",
      title: "What to Look for in a Budget Tent",
      tips: [
        { title: "Hydrostatic Rating", body: "Aim for 1500mm+ waterproofing. Higher = better rain protection." },
        { title: "Seam Sealing", body: "Taped seams beat stitched every time. Prevents water wicking through needle holes." },
        { title: "Pole Quality", body: "Fiberglass is standard at this price; aluminum is a bonus for weight and durability." },
        { title: "Interior Height", body: "Check if you can actually sit up inside. '2-person' labels are often optimistic." },
      ]
    },
  ],

  "best-budget-sleeping-bags-cold-weather": [
    {
      type: "spotlight",
      spotlightItem: {
        name: "Teton Sports Celsius Regular",
        price: "$34.99",
        rating: "4.5/5",
        why: "Genuine 0°F cold-weather performance at a fraction of the price. Mummy design traps heat efficiently, snag-free zipper, and lifetime warranty. The obvious choice for cold nights.",
        category: "Sleeping Bag"
      }
    },
    {
      type: "product-grid",
      title: "Cold Weather Picks",
      items: [
        { label: "Teton Sports Celsius (0°F)", detail: "$34.99", note: "4.5★", category: "Best Overall", icon: "🥶", link: "https://www.amazon.com/shop/camprally" },
        { label: "Coleman Brazos 30°F", detail: "$24.99", note: "4.3★", category: "Most Affordable", icon: "💰", link: "https://www.amazon.com/shop/camprally" },
        { label: "Oaskys 3-Season", detail: "$27.99", note: "4.1★", category: "Ultralight", icon: "🪶", link: "https://www.amazon.com/shop/camprally" },
      ]
    },
    {
      type: "callout",
      calloutType: "tip",
      calloutTitle: "Temperature Rating Tip",
      calloutBody: "Get a bag rated 10-15°F below your expected low for a safety margin. Most manufacturers rate conservatively — a '20°F bag' might keep you comfortable at 25-30°F."
    },
    {
      type: "tips",
      title: "Cold Weather Tips",
      tips: [
        { title: "Eat a Big Dinner", body: "Digestion generates heat. A full stomach keeps you warmer than an empty one." },
        { title: "Stay Dry", body: "Wet clothes = cold night. Change into dry base layers before bed." },
        { title: "Use a Sleeping Pad", body: "Ground steals 80% of your body heat. Never skip the pad, even on warm nights." },
        { title: "Put Clothes in Your Bag", body: "Cold boots in your sleeping bag = eventually warm boots. Start this 30 min before bed." },
      ]
    },
  ],

  "budget-camping-cookware-that-works": [
    {
      type: "spotlight",
      spotlightItem: {
        name: "Stanley Adventure Camp Cook Set",
        price: "$29.99",
        rating: "4.6/5",
        why: "24oz pot, two cups, and lid/pan nest perfectly. Stainless steel handles don't melt over open flame. At $30, it's the best value in camping cookware. Period.",
        category: "Cookware"
      }
    },
    {
      type: "product-grid",
      title: "Cookware Picks",
      items: [
        { label: "Stanley Adventure Camp Cook Set", detail: "$29.99", note: "4.6★", category: "Best Pick", icon: "🍳", link: "https://www.amazon.com/shop/camprally" },
        { label: "MalloMe Camping Cookware Mess Kit", detail: "$22.99", note: "4.4★", category: "Budget Runner-Up", icon: "💰", link: "https://www.amazon.com/shop/camprally" },
        { label: "GSI Cascadian 1-Person Table Set", detail: "$18.99", note: "4.2★", category: "Solo", icon: "🎒", link: "https://www.amazon.com/shop/camprally" },
      ]
    },
    {
      type: "callout",
      calloutType: "tip",
      calloutTitle: "Why Titanium Isn't Worth It",
      calloutBody: "Titanium is lighter, but it heats food unevenly, costs more, and shows scratches prominently. For budget camping, stainless or aluminum is just fine."
    },
  ],

  "affordable-headlamps-camping": [
    {
      type: "spotlight",
      spotlightItem: {
        name: "Black Diamond Spot 400",
        price: "$39.99",
        rating: "4.5/5",
        why: "400 lumens handles trail running, camp chores, and reading. PowerTap technology switches modes instantly. IPX67 waterproof and 200+ hour battery life on low.",
        category: "Headlamp"
      }
    },
    {
      type: "product-grid",
      title: "Lighting Picks",
      items: [
        { label: "Black Diamond Spot 400", detail: "$39.99", note: "4.5★", category: "Headlamp", icon: "🔦", link: "https://www.amazon.com/shop/camprally" },
        { label: "Vont 4-Pack LED Lanterns", detail: "$14.99", note: "4.6★", category: "Lantern 4-pack", icon: "🏮", link: "https://www.amazon.com/shop/camprally" },
      ]
    },
    {
      type: "callout",
      calloutType: "tip",
      calloutTitle: "Get Both",
      calloutBody: "Headlamp for: hiking, cooking, anything mobile. Lantern for: camp ambiance, tent lighting, group activities. The combo covers every scenario."
    },
  ],

  "best-budget-sleeping-pads-under-50": [
    {
      type: "spotlight",
      spotlightItem: {
        name: "Klymit Static V",
        price: "$44.99",
        rating: "4.5/5",
        why: "V-chamber design limits air movement and heat loss. 4.7/5 rating across 10,000+ reviews. Packs to water bottle size with lifetime warranty. The gold standard of budget pads.",
        category: "Sleeping Pad"
      }
    },
    {
      type: "product-grid",
      title: "Sleeping Pad Picks",
      items: [
        { label: "Klymit Static V", detail: "$44.99", note: "4.5★", category: "Best Pick", icon: "💤", link: "https://www.amazon.com/shop/camprally" },
        { label: "Hikenture Ultralight Sleeping Pad", detail: "$35.99", note: "4.3★", category: "Self-Inflating", icon: "🎈", link: "https://www.amazon.com/shop/camprally" },
        { label: "Thermarest Z Lite Sol", detail: "$54.99", note: "4.6★", category: "Foam Classic", icon: "🧱", link: "https://www.amazon.com/shop/camprally" },
        { label: "Amazon Basics Foam Pad", detail: "$12.99", note: "3.9★", category: "Backup", icon: "🪵", link: "https://www.amazon.com/shop/camprally" },
      ]
    },
    {
      type: "callout",
      calloutType: "warning",
      calloutTitle: "Your Sleeping Pad Is More Important Than Your Sleeping Bag",
      calloutBody: "80% of your body heat escapes through contact with the ground. A $200 sleeping bag on a bare tarp will leave you colder than a $30 bag on a quality pad."
    },
  ],

  "budget-portable-camping-stoves-compared": [
    {
      type: "spotlight",
      spotlightItem: {
        name: "Etekcity Ultralight Portable Stove",
        price: "$12.99",
        rating: "4.4/5",
        why: "Piezo ignition means no lighter needed. Adjustable flame gives cooking control. 3.9 oz and folds to pocket size. For under $13, this stove rivals units 5x the price.",
        category: "Stove"
      }
    },
    {
      type: "product-grid",
      title: "Stove Picks",
      items: [
        { label: "Etekcity Ultralight Portable Stove", detail: "$12.99", note: "4.4★", category: "Best Budget", icon: "🔥", link: "https://www.amazon.com/shop/camprally" },
        { label: "Coleman Classic Propane Stove", detail: "$54.99", note: "4.6★", category: "Upgrade Pick", icon: "🍳", link: "https://www.amazon.com/shop/camprally" },
        { label: "Jetboil Zip", detail: "$79.99", note: "4.5★", category: "Backpacking", icon: "🎒", link: "https://www.amazon.com/shop/camprally" },
      ]
    },
    {
      type: "table",
      title: "Fuel Cost Comparison",
      rows: [
        ["Stove Type", "Fuel Cost/Trip", "Availability"],
        ["Canister", "$5-8", "Hardware stores"],
        ["Liquid Gas", "$8-12", "Outdoor shops"],
        ["Propane", "$4-6", "Everywhere"],
      ]
    },
  ],

  "affordable-water-filtration-camping": [
    {
      type: "spotlight",
      spotlightItem: {
        name: "Sawyer Products Squeeze Filter",
        price: "$37.99",
        rating: "4.7/5",
        why: "0.1-micron absolute pore size removes 99.99999% of bacteria and 99.9999% of protozoa. 100,000 gallon lifespan = essentially forever. Weighs 3 oz.",
        category: "Water Filter"
      }
    },
    {
      type: "product-grid",
      title: "Water Filtration Picks",
      items: [
        { label: "Sawyer Squeeze Filter", detail: "$37.99", note: "4.7★", category: "Best Pick", icon: "💧", link: "https://www.amazon.com/shop/camprally" },
        { label: "LifeStraw Personal Water Filter", detail: "$17.99", note: "4.6★", category: "Budget Pick", icon: "🥤", link: "https://www.amazon.com/shop/camprally" },
      ]
    },
    {
      type: "callout",
      calloutType: "warning",
      calloutTitle: "Don't: The Bleach Method",
      calloutBody: "8 drops per gallon, 30-minute wait, tastes terrible, dosage is imprecise. Just buy a filter. Never risk giardia over $18."
    },
  ],

  "best-budget-gps-compass-hiking": [
    {
      type: "spotlight",
      spotlightItem: {
        name: "Suunto A-10 Compass",
        price: "$19.99",
        rating: "4.4/5",
        why: "Liquid-filled needle stabilizes quickly, baseplate markings work with any map. Balanced for northern hemisphere, lifetime warranty. The benchmark for budget compasses.",
        category: "Compass"
      }
    },
    {
      type: "product-grid",
      title: "Navigation Picks",
      items: [
        { label: "Suunto A-10 Compass", detail: "$19.99", note: "4.4★", category: "Compass", icon: "🧭", link: "https://www.amazon.com/shop/camprally" },
        { label: "Garmin eTrex 22x", detail: "$99.99", note: "4.3★", category: "GPS", icon: "📍", link: "https://www.amazon.com/shop/camprally" },
      ]
    },
    {
      type: "callout",
      calloutType: "tip",
      calloutTitle: "Start With Your Phone",
      calloutBody: "Before buying anything, download offline maps (Gaia GPS or CalTopo). This is your baseline navigation kit. Then add a compass as backup."
    },
    {
      type: "tips",
      title: "Navigation Essentials",
      tips: [
        { title: "Download Offline Maps", body: "Before your trip. You'll lose cell signal when it matters most." },
        { title: "Carry a Compass", body: "Even if you carry GPS. Electronics fail; magnetics don't." },
        { title: "Know How to Take a Bearing", body: "5-minute YouTube video teaches this. Practice at home." },
        { title: "Pack a Paper Map", body: "As final backup. Topographic map of your area." },
      ]
    },
  ],

  "best-budget-multitool-camping": [
    {
      type: "spotlight",
      spotlightItem: {
        name: "Gerber Suspension-NXT",
        price: "$34.99",
        rating: "4.5/5",
        why: "15 tools cover every camp scenario. Spring-loaded pliers reduce hand fatigue, outside-accessible blades, butterfly opening is smooth. The benchmark budget multi-tool.",
        category: "Multi-Tool"
      }
    },
    {
      type: "product-grid",
      title: "Multi-Tool Picks",
      items: [
        { label: "Gerber Suspension-NXT", detail: "$34.99", note: "4.5★", category: "Best Pick", icon: "🔧", link: "https://www.amazon.com/shop/camprally" },
        { label: "Amazon Basics Multi-Tool", detail: "$14.99", note: "4.1★", category: "Budget Pick", icon: "💰", link: "https://www.amazon.com/shop/camprally" },
      ]
    },
    {
      type: "callout",
      calloutType: "warning",
      calloutTitle: "Don't Buy: Gas Station Tools",
      calloutBody: "$5 multi-tools at gas stations are made of inferior steel. They bend, break, and frustrate. Buy once, cry once."
    },
  ],

  "best-budget-camping-knife": [
    {
      type: "spotlight",
      spotlightItem: {
        name: "Mora Companion",
        price: "$19.99",
        rating: "4.7/5",
        why: "Swedish high-carbon steel takes a razor edge and holds it. Rubber handle won't slip, full tang construction is nearly indestructible. Fire striker notch on spine. Buy two.",
        category: "Knife"
      }
    },
    {
      type: "product-grid",
      title: "Knife Picks",
      items: [
        { label: "Mora Companion", detail: "$19.99", note: "4.7★", category: "Best Pick", icon: "🔪", link: "https://www.amazon.com/shop/camprally" },
        { label: "OutdoorElement Indus Review Knife", detail: "$8.99", note: "4.3★", category: "Budget Pick", icon: "💰", link: "https://www.amazon.com/shop/camprally" },
      ]
    },
    {
      type: "callout",
      calloutType: "warning",
      calloutTitle: "Skip These Temptations",
      calloutBody: "Swiss Army Knives: great tools, but thin blades struggle with camp tasks. Tactical/military knives: overbuilt for camping. Gas station knives: don't."
    },
  ],

  "affordable-rain-gear-camping": [
    {
      type: "spotlight",
      spotlightItem: {
        name: "Frogg Toggs Ultra-Lite Rain Suit",
        price: "$19.99",
        rating: "4.1/5",
        why: "Two-piece suit (jacket + pants) stuffs into its own pocket and deploys in seconds. 5,000mm waterproofing handles heavy rain. Breathable reduces interior condensation.",
        category: "Rain Gear"
      }
    },
    {
      type: "product-grid",
      title: "Rain Gear Picks",
      items: [
        { label: "Frogg Toggs Ultra-Lite Rain Suit", detail: "$19.99", note: "4.1★", category: "Best Pick", icon: "🌧️", link: "https://www.amazon.com/shop/camprally" },
        { label: "Enjoying Waterproof Rain Jacket", detail: "$15.99", note: "4.0★", category: "Budget Pick", icon: "💰", link: "https://www.amazon.com/shop/camprally" },
      ]
    },
    {
      type: "callout",
      calloutType: "warning",
      calloutTitle: "Trash Bags Are Not Rain Gear",
      calloutBody: "Zero breathability = sweat-soaked inside. Tears easily. Zero durability. Still causes hypothermia in cold rain. Just buy real rain gear. It's not optional."
    },
  ],

  "budget-camp-chairs-that-last": [
    {
      type: "spotlight",
      spotlightItem: {
        name: "KingCamp Low Sling Folding Chair",
        price: "$39.99",
        rating: "4.3/5",
        why: "Closer to ground (great for campfires), mesh sides provide airflow. Oversized cup holder, padded armrests, storage pocket. Folds flat for trunk storage.",
        category: "Camp Chair"
      }
    },
    {
      type: "product-grid",
      title: "Chair Picks",
      items: [
        { label: "KingCamp Low Sling Folding Chair", detail: "$39.99", note: "4.3★", category: "Best Pick", icon: "🪑", link: "https://www.amazon.com/shop/camprally" },
        { label: "Amazon Basics Folding Camp Chair", detail: "$24.99", note: "4.2★", category: "Budget Pick", icon: "💰", link: "https://www.amazon.com/shop/camprally" },
      ]
    },
    {
      type: "callout",
      calloutType: "warning",
      calloutTitle: "Skip These Temptations",
      calloutBody: "Ultralight trekking pole chairs: uncomfortable over 30 min. $10 gas station chairs: frame bends first sit. Hammock chairs: great concept, mediocre execution."
    },
  ],

  "best-cheap-camping-tables": [
    {
      type: "spotlight",
      spotlightItem: {
        name: "Trekology Ultralight Camping Table",
        price: "$32.99",
        rating: "4.4/5",
        why: "Aluminum surface, sets up in 3 seconds (no assembly). Magnetic legs lock securely. 1.8 lbs, packs to large book size. Carry bag included.",
        category: "Camping Table"
      }
    },
    {
      type: "product-grid",
      title: "Table Picks",
      items: [
        { label: "Trekology Ultralight Camping Table", detail: "$32.99", note: "4.4★", category: "Best Pick", icon: "🪑", link: "https://www.amazon.com/shop/camprally" },
        { label: "Coleman Portable Camping Table", detail: "$27.99", note: "4.0★", category: "Budget Pick", icon: "💰", link: "https://www.amazon.com/shop/camprally" },
      ]
    },
    {
      type: "callout",
      calloutType: "tip",
      calloutTitle: "DIY Alternative: Plastic Bins",
      calloutBody: "Stack two plastic storage bins. Instant table: completely free, adjustable height, provides storage underneath. Works surprisingly well for casual car camping."
    },
  ],

  "budget-camping-accessories-under-20": [
    {
      type: "product-grid",
      title: "Accessories Under $20",
      items: [
        { label: "Nalgene Wide Mouth 32oz", detail: "$14.99", note: "4.7★", category: "Essential", icon: "💧", link: "https://www.amazon.com/shop/camprally" },
        { label: "Sea to Summit Dry Sack 8L", detail: "$16.99", note: "4.5★", category: "Essential", icon: "🎒", link: "https://www.amazon.com/shop/camprally" },
        { label: "Coghlan's Waterproof Matches (50)", detail: "$10.99", note: "4.3★", category: "Smart", icon: "🔥", link: "https://www.amazon.com/shop/camprally" },
        { label: "Bungee Cords (Set of 12)", detail: "$12.99", note: "4.4★", category: "Essential", icon: "🔗", link: "https://www.amazon.com/shop/camprally" },
        { label: "Travel Bidet", detail: "$8.99", note: "4.2★", category: "Game-Changer", icon: "🚿", link: "https://www.amazon.com/shop/camprally" },
      ]
    },
  ],

  "how-to-start-camping-no-gear": [
    {
      type: "callout",
      calloutType: "tip",
      calloutTitle: "Borrow Before You Buy",
      calloutBody: "Family and friends often have gear collecting dust. Outdoor clubs have gear libraries. REI rents full tent + sleeping bag + pad for ~$50/day."
    },
    {
      type: "checklist",
      title: "The Minimum Viable Setup (Borrow or Rent)",
      checkItems: [
        "Tent",
        "Sleeping bag",
        "Sleeping pad",
        "Flashlight/headlamp",
      ]
    },
    {
      type: "callout",
      calloutType: "tip",
      calloutTitle: "Try Glamping First",
      calloutBody: "State park cabins ($50-100/night with real beds), canvas tents with cots, or RV rental via Turo/Outdoorsy. Start comfortable, go rugged when ready."
    },
    {
      type: "tips",
      title: "First Timer Tips",
      tips: [
        { title: "Start Close to Home", body: "1-2 hours away in case you forget something." },
        { title: "Choose Developed Campgrounds", body: "Bathrooms, water, and rangers nearby reduces stress." },
        { title: "Check the Weather", body: "No one wants a storm as their first experience." },
        { title: "Bring Friends", body: "Memories are better shared." },
      ]
    },
  ],

  "how-to-pack-light-camping": [
    {
      type: "callout",
      calloutType: "tip",
      calloutTitle: "The Golden Rule",
      calloutBody: "If you haven't used it on your last 3 trips, you won't use it on this one. Leave it at home."
    },
    {
      type: "checklist",
      title: "Weekend Packing List (30 lbs max)",
      checkItems: [
        "2 t-shirts, 1 long sleeve",
        "2 shorts/pants, 3 underwear, 3 socks",
        "1 jacket (always pack this)",
        "Sandals or camp shoes",
        "Sleeping bag + pad",
        "Pillow (or stuff a fleece)",
        "Stove + fuel + lighter",
        "Cookware + food + water",
        "Headlamp + first aid kit",
        "Sunscreen + bug spray",
      ]
    },
    {
      type: "callout",
      calloutType: "warning",
      calloutTitle: "What's Actually Optional",
      calloutBody: "Camp chairs (sit on logs), tables (use a flat rock), extra shoes (one pair is fine), books (phone works). Less gear = more adventure."
    },
  ],

  "how-to-find-free-campsites": [
    {
      type: "product-grid",
      title: "Best Free Camping Resources",
      items: [
        { label: "iOverlander App", detail: "Free", note: "5M+ users", category: "App", icon: "📱", link: "https://www.amazon.com/shop/camprally" },
        { label: "Campendium", detail: "Free", note: "Crowdsourced", category: "Website", icon: "🌐", link: "https://www.amazon.com/shop/camprally" },
        { label: "USDA Forest Service Map", detail: "Free", note: "Maps + info", category: "Official", icon: "🏕️", link: "https://www.amazon.com/shop/camprally" },
      ]
    },
    {
      type: "product-grid",
      title: "Favorite Free Camping Regions",
      items: [
        { label: "Colorado National Forests", detail: "Millions of acres", note: "Stunning scenery", category: "Mountain", icon: "🏔️", link: "https://www.amazon.com/shop/camprally" },
        { label: "Utah BLM Lands", detail: "Red rock camping", note: "Rarely crowded", category: "Desert", icon: "🏜️", link: "https://www.amazon.com/shop/camprally" },
        { label: "California National Forests", detail: "Escape coastal crowds", note: "Year-round", category: "Forest", icon: "🌲", link: "https://www.amazon.com/shop/camprally" },
        { label: "New Mexico BLM", detail: "Remote + beautiful", note: "Minimal restrictions", category: "Desert", icon: "🌵", link: "https://www.amazon.com/shop/camprally" },
      ]
    },
    {
      type: "callout",
      calloutType: "warning",
      calloutTitle: "Dispersed Camping Rules",
      calloutBody: "Generally free on BLM and National Forest lands. No services (no bathroom, trash, or fire rings). 14-day limit in most locations. Leave no trace is non-negotiable."
    },
  ],

  "best-time-year-camp-free": [
    {
      type: "product-grid",
      title: "Seasonal Camping Guide",
      items: [
        { label: "🌸 Spring (Mar-May)", detail: "Desert SW, trailheads", note: "Bloom season", category: "Best: Southwest", icon: "🌸", link: "https://www.amazon.com/shop/camprally" },
        { label: "☀️ Summer (Jun-Aug)", detail: "Northern forests, high elevations", note: "Crowds = peak", category: "Best: North", icon: "☀️", link: "https://www.amazon.com/shop/camprally" },
        { label: "🍂 Fall (Sep-Nov)", detail: "Everywhere in US/Canada", note: "Best-kept secret", category: "Best: Everywhere", icon: "🍂", link: "https://www.amazon.com/shop/camprally" },
        { label: "❄️ Winter (Dec-Feb)", detail: "Deserts, mild climates", note: "Skills required", category: "Best: Deserts", icon: "❄️", link: "https://www.amazon.com/shop/camprally" },
      ]
    },
    {
      type: "callout",
      calloutType: "tip",
      calloutTitle: "Off-Season Advantage",
      calloutBody: "Campgrounds empty, weather cools, foliage explodes, and bugs disappear. January Utah BLM, February Arizona desert, November Colorado National Forests — these are the hidden gems."
    },
  ],

  "budget-camping-hacks-that-work": [
    {
      type: "product-grid",
      title: "Field-Tested Hacks",
      items: [
        { label: "🧊 Freeze Your Food", detail: "Thaws in cooler over 2-3 days", note: "Keeps other food cold too", category: "Cooking", icon: "🧊", link: "https://www.amazon.com/shop/camprally" },
        { label: "🧊 Pre-Measure Spices", detail: "Mix taco seasoning in ziplocks", note: "No measuring in the wild", category: "Cooking", icon: "🧂", link: "https://www.amazon.com/shop/camprally" },
        { label: "💧 Warmed Water Bottle", detail: "Fill Nalgene with hot water", note: "Free foot warmer in sleeping bag", category: "Sleep", icon: "🛏️", link: "https://www.amazon.com/shop/camprally" },
        { label: "🪵 Double Sleeping Pad", detail: "Stack two foam pads", note: "R-value 4+ from two $12 pads", category: "Sleep", icon: "💤", link: "https://www.amazon.com/shop/camprally" },
        { label: "🔥 Char Cloth Hack", detail: "Altoids tin + cotton balls in fire", note: "Lights with any spark", category: "Fire", icon: "🔥", link: "https://www.amazon.com/shop/camprally" },
        { label: "🧴 Denture Tablets", detail: "Half tablet cleans Nalgene in 30 min", note: "Emergency water bottle cleaner", category: "Water", icon: "💧", link: "https://www.amazon.com/shop/camprally" },
      ]
    },
    {
      type: "callout",
      calloutType: "tip",
      calloutTitle: "The Newspaper Seating Test",
      calloutBody: "Spread newspaper under your tent. If it gets damp overnight, that's where water pools. Now you know to set up elsewhere. Free site assessment tool."
    },
  ],
};

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────
function getHeroImage(slug: string): string {
  return HERO_IMAGES[slug] || HERO_IMAGES.default;
}

function getProductImage(productName: string): string {
  for (const [key, url] of Object.entries(PRODUCT_IMAGES)) {
    if (productName.toLowerCase().includes(key.toLowerCase())) return url;
  }
  return PRODUCT_IMAGES.default;
}

function getCustomSections(slug: string): CustomSection[] {
  return ARTICLE_CUSTOM_SECTIONS[slug] || [];
}

// ─────────────────────────────────────────
// RENDERERS FOR CUSTOM SECTIONS
// ─────────────────────────────────────────

function renderIcon(iconName: string) {
    const icons: Record<string, string> = {
    "⛺": "⛺",     "🛏️": "🛏️",     "💤": "💤",     "🍳": "🍳",     "🔥": "🔥",
    "💡": "💡",     "💧": "💧",     "🏆": "🏆",     "🎒": "🎒",     "👨‍👩‍👧": "👨‍👩‍👧",
    "🚗": "🚗",     "🥶": "🥶",     "💰": "💰",     "🪶": "🪶",     "🔦": "🔦",
    "🏮": "🏮",     "🎈": "🎈",     "🧱": "🧱",     "🪵": "🪵",     "🧭": "🧭",
    "📍": "📍",     "🔧": "🔧",     "🔪": "🔪",     "🌧️": "🌧️",     "🪑": "🪑",
    "🌐": "🌐",     "🏕️": "🏕️",     "🏔️": "🏔️",     "🏜️": "🏜️",     "🌲": "🌲",
    "🌵": "🌵",     "🌸": "🌸",     "☀️": "☀️",     "🍂": "🍂",     "❄️": "❄️",
    "🧊": "🧊",     "🧂": "🧂",     "🚿": "🚿",     "🔗": "🔗",     "📱": "📱",
  };
  return icons[iconName] || "✨";
}

function StatsSection({ stats }: { stats: Array<{ value: string; label: string }> }) {
  return (
    <div className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
      {stats.map((stat, i) => (
        <div key={i} className="rounded-xl border bg-gradient-to-br from-camp-green/8 to-transparent p-4 text-center">
          <p className="text-2xl font-bold text-camp-green">{stat.value}</p>
          <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}

function ProductGrid({ title, subtitle, items }: { title?: string; subtitle?: string; items?: Array<{ label: string; detail?: string; note?: string; category?: string; icon?: string; link?: string }> }) {
  if (!items?.length) return null;
  return (
    <div className="mb-10">
      {title && <h2 className="mb-2 text-xl font-bold">{title}</h2>}
      {subtitle && <p className="mb-4 text-muted-foreground text-sm">{subtitle}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item, i) => (
          <a
            key={i}
            href={item.link || "https://www.amazon.com/shop/camprally"}
            target="_blank"
            rel="nofollow noopener"
            className="group flex items-center gap-3 rounded-xl border p-4 transition-all hover:border-camp-green/50 hover:shadow-sm hover:shadow-camp-green/10"
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-camp-green/10 text-lg">
              {renderIcon(item.icon || "✨")}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-tight group-hover:text-camp-green transition-colors">{item.label}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-sm font-bold text-camp-green">{item.detail}</span>
                {item.note && (
                  <span className="text-xs text-muted-foreground">{item.note}</span>
                )}
              </div>
              {item.category && (
                <p className="text-xs text-muted-foreground mt-0.5">{item.category}</p>
              )}
            </div>
            <ChevronRight className="size-4 text-muted-foreground group-hover:text-camp-green transition-colors flex-shrink-0" />
          </a>
        ))}
      </div>
    </div>
  );
}

function SpotlightSection({ item }: { item: { name: string; price: string; rating: string; why: string; category: string } }) {
  return (
    <div className="mb-10 rounded-2xl border border-camp-green/20 bg-gradient-to-br from-camp-green/5 to-transparent overflow-hidden">
      <div className="bg-camp-green/10 px-6 py-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-camp-green">{item.category}</span>
        <span className="text-xs text-muted-foreground">Our Top Pick</span>
      </div>
      <div className="p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-lg font-bold leading-tight">{item.name}</h3>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-lg font-bold text-camp-green">{item.price}</span>
              <div className="flex items-center gap-0.5">
                <Star className="size-3.5 fill-camp-orange text-camp-orange" />
                <span className="text-sm text-muted-foreground">{item.rating}</span>
              </div>
            </div>
          </div>
          <a
            href="https://www.amazon.com/shop/camprally"
            target="_blank"
            rel="nofollow noopener"
            className="flex-shrink-0 rounded-lg bg-camp-green px-4 py-2 text-sm font-semibold text-white transition hover:bg-camp-green/90"
          >
            View on Amazon
          </a>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{item.why}</p>
      </div>
    </div>
  );
}

function CalloutSection({ calloutType, calloutTitle, calloutBody }: { calloutType?: string; calloutTitle?: string; calloutBody?: string }) {
  const styles: Record<string, { border: string; bg: string; icon: string; label: string }> = {
    save:    { border: "border-camp-green/30", bg: "bg-camp-green/5", icon: "💰", label: "Save" },
    splurge: { border: "border-camp-orange/30", bg: "bg-camp-orange/5", icon: "💸", label: "Splurge" },
    tip:     { border: "border-blue-400/30", bg: "bg-blue-400/5", icon: "💡", label: "Pro Tip" },
    warning: { border: "border-red-400/30", bg: "bg-red-400/5", icon: "⚠️", label: "Warning" },
  };
  const style = styles[calloutType || "tip"] || styles.tip;
  return (
    <div className={`mb-6 rounded-xl border ${style.border} ${style.bg} p-5`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{style.icon}</span>
        <h3 className="font-bold text-sm">{calloutTitle || style.label}</h3>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">{calloutBody}</p>
    </div>
  );
}

function ChecklistSection({ title, checkItems }: { title?: string; checkItems?: string[] }) {
  if (!checkItems?.length) return null;
  return (
    <div className="mb-10">
      {title && <h2 className="mb-4 text-xl font-bold">{title}</h2>}
      <div className="grid gap-2 sm:grid-cols-2">
        {checkItems.map((item, i) => (
          <label key={i} className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors">
            <input type="checkbox" className="h-4 w-4 rounded border-camp-green text-camp-green focus:ring-camp-green" />
            <span className="text-sm">{item}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function TipsSection({ title, tips }: { title?: string; tips?: Array<{ title: string; body: string }> }) {
  if (!tips?.length) return null;
  return (
    <div className="mb-10">
      {title && <h2 className="mb-4 text-xl font-bold">{title}</h2>}
      <div className="space-y-3">
        {tips.map((tip, i) => (
          <div key={i} className="rounded-lg border p-4">
            <p className="font-semibold text-sm mb-1">{tip.title}</p>
            <p className="text-sm text-muted-foreground">{tip.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TableSection({ title, rows }: { title?: string; rows?: string[][] }) {
  if (!rows?.length) return null;
  return (
    <div className="mb-10">
      {title && <h2 className="mb-4 text-xl font-bold">{title}</h2>}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className={i === 0 ? "bg-camp-green/10" : ""}>
                {row.map((cell, j) => (
                  <td key={j} className={`px-4 py-2.5 ${i === 0 ? "font-semibold" : "text-muted-foreground"} ${j > 0 ? "text-right" : ""}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// MARKDOWN PROCESSOR
// ─────────────────────────────────────────
async function processMarkdown(content: string): Promise<string> {
  const trimmed = content.trim();
  const processed = await remark()
    .use(html)
    .process(trimmed);
  let htmlContent = processed.toString();

  // Add anchor IDs to h2 headings
  const headingMatches = htmlContent.matchAll(/<h2([^>]*)>(.*?)<\/h2>/g) || [];
  const toc: { text: string; id: string }[] = [];
  for (const match of headingMatches) {
    const fullMatch = match[0];
    const text = match[1]; // This is actually the inner content in remark-html output
    // The format from remark-html is <h2>text</h2>, group 1 is empty, group 2 is content
    const id = text
      .toLowerCase()
      .replace(/<[^>]+>/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    toc.push({ text: text.replace(/<[^>]+>/g, ""), id });
    if (!fullMatch.includes(`id="${id}"`)) {
      htmlContent = htmlContent.replace(
        fullMatch,
        fullMatch.replace("<h2", `<h2 id="${id}"`)
      );
    }
  }

  return htmlContent;
}

// ─────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────
export async function generateStaticParams() {
  return articles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = articles.find((a) => a.slug === slug);
  if (!article) return { title: "Article Not Found" };
  return {
    title: `${article.title} | CampRally`,
    description: article.excerpt,
  };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = articles.find((a) => a.slug === slug);
  if (!article) notFound();

  const related = articles
    .filter((a) => a.slug !== slug && a.category === article.category)
    .slice(0, 3);

  const contentHtml = await processMarkdown(article.content);
  const customSections = getCustomSections(slug);
  const heroImage = getHeroImage(slug);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      {/* Back nav */}
      <Link
        href="/blog"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to all articles
      </Link>

      {/* Hero */}
      <div className="relative mb-8 overflow-hidden rounded-2xl">
        <div className="relative h-[360px] w-full">
          <Image
            src={heroImage}
            alt={article.title}
            fill
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
          <Badge variant="secondary" className="mb-3 bg-camp-green text-white border-0 text-xs">
            {article.category}
          </Badge>
          <h1 className="mb-2 text-2xl font-bold tracking-tight text-white md:text-4xl">
            {article.title}
          </h1>
          <p className="text-white/70 text-sm">
            {new Date(article.date).toLocaleDateString("en-US", {
              month: "long", day: "numeric", year: "numeric",
            })}
            {" · "}
            {article.readTime}
          </p>
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-[1fr_300px]">
        {/* Main Content */}
        <article>
          {/* Intro paragraph */}
          <p className="mb-8 text-lg leading-relaxed text-foreground/80 first-letter:text-5xl first-letter:font-bold first-letter:text-camp-green first-letter:float-left first-letter:mr-3 first-letter:mt-1">
            {article.excerpt}
          </p>

          {/* Custom sections */}
          {customSections.map((section, i) => {
            switch (section.type) {
              case "stats":
                return section.stats ? <StatsSection key={i} stats={section.stats} /> : null;
              case "product-grid":
                return <ProductGrid key={i} title={section.title} subtitle={section.subtitle} items={section.items} />;
              case "spotlight":
                return section.spotlightItem ? <SpotlightSection key={i} item={section.spotlightItem} /> : null;
              case "callout":
                return <CalloutSection key={i} calloutType={section.calloutType} calloutTitle={section.calloutTitle} calloutBody={section.calloutBody} />;
              case "checklist":
                return <ChecklistSection key={i} title={section.title} checkItems={section.checkItems} />;
              case "tips":
                return section.tips ? <TipsSection key={i} title={section.title} tips={section.tips} /> : null;
              case "table":
                return section.rows ? <TableSection key={i} title={section.title} rows={section.rows} /> : null;
              default:
                return null;
            }
          })}

          {/* Rendered article body */}
          <div
            className="prose prose-stone max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-h2:mt-10 prose-h2:mb-4 prose-h2:text-2xl prose-h3:mt-6 prose-h3:mb-3 prose-h3:text-lg prose-p:leading-7 prose-a:text-camp-green prose-a:font-medium prose-a:no-underline hover:prose-a:underline prose-li:leading-7 prose-li:mb-1 prose-ul:my-3 prose-ol:my-3"
            dangerouslySetInnerHTML={{ __html: contentHtml }}
          />

          {/* Bottom CTA */}
          <div className="mt-12 rounded-2xl bg-gradient-to-br from-camp-green/10 via-camp-green/5 to-transparent border border-camp-green/20 p-8 text-center">
            <h3 className="text-xl font-bold mb-2">Shop the Gear We Recommend</h3>
            <p className="text-muted-foreground mb-4 text-sm">
              We test every piece of gear we recommend. As an Amazon Associate, we earn from qualifying purchases — at no extra cost to you.
            </p>
            <a
              href="https://www.amazon.com/shop/camprally"
              target="_blank"
              rel="nofollow noopener"
              className="inline-flex items-center gap-2 rounded-lg bg-camp-green px-6 py-3 font-semibold text-white transition hover:bg-camp-green/90"
            >
              Shop on Amazon
              <ExternalLink className="size-4" />
            </a>
          </div>
        </article>

        {/* Sidebar */}
        <aside className="space-y-6">
          {/* Quick Info */}
          <Card className="border-camp-green/20 bg-gradient-to-br from-camp-green/5 to-transparent">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Article Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Category</span>
                <span className="font-medium">{article.category}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Read time</span>
                <span className="font-medium">{article.readTime}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Author</span>
                <span className="font-medium">{article.author}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Published</span>
                <span className="font-medium">
                  {new Date(article.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Related Articles */}
          {related.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Related Articles</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {related.map((r) => (
                  <Link
                    key={r.slug}
                    href={`/blog/${r.slug}`}
                    className="block text-sm text-muted-foreground transition hover:text-foreground"
                  >
                    {r.title}
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Newsletter */}
          <Card className="border-camp-green/20 bg-gradient-to-br from-camp-green/5 to-transparent">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Get Weekly Gear Picks</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">
                Join 2,847 campers getting our best budget gear recommendations.
              </p>
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="your@email.com"
                  className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
                />
                <button className="rounded-lg bg-camp-green px-3 py-2 text-sm font-semibold text-white">
                  →
                </button>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
