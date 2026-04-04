export interface Product {
  id: string;
  name: string;
  price: number;
  rating: number;
  amazonUrl: string;
  category: string;
  description: string;
}

export const products: Product[] = [
  // Tents
  {
    id: "prod-001",
    name: "Coleman Sundome 2-Person Tent",
    price: 49.99,
    rating: 4.4,
    amazonUrl: "https://www.amazon.com/dp/B0PROD001?tag=camprally-20",
    category: "Tents",
    description:
      "Easy-setup dome tent with WeatherTec system to keep you dry. Great for weekend car camping trips.",
  },
  {
    id: "prod-002",
    name: "Kelty Discovery Element 4-Person Tent",
    price: 89.99,
    rating: 4.2,
    amazonUrl: "https://www.amazon.com/dp/B0PROD002?tag=camprally-20",
    category: "Tents",
    description:
      "Spacious 4-person tent with a full-coverage rainfly and internal storage pockets for organized camping.",
  },

  // Sleeping Bags
  {
    id: "prod-003",
    name: "Teton Sports Celsius Regular Sleeping Bag",
    price: 34.99,
    rating: 4.5,
    amazonUrl: "https://www.amazon.com/dp/B0PROD003?tag=camprally-20",
    category: "Sleeping Bags",
    description:
      "Lightweight mummy-style sleeping bag rated to 0°F. Includes compression sack for easy packing.",
  },
  {
    id: "prod-004",
    name: "Coleman Brazos 30°F Sleeping Bag",
    price: 24.99,
    rating: 4.3,
    amazonUrl: "https://www.amazon.com/dp/B0PROD004?tag=camprally-20",
    category: "Sleeping Bags",
    description:
      "Rectangular sleeping bag with ThermoTech insulation. Machine washable for easy care after trips.",
  },
  {
    id: "prod-005",
    name: "Oaskys 3-Season Sleeping Bag",
    price: 27.99,
    rating: 4.1,
    amazonUrl: "https://www.amazon.com/dp/B0PROD005?tag=camprally-20",
    category: "Sleeping Bags",
    description:
      "Waterproof lightweight sleeping bag ideal for spring, summer, and fall camping adventures.",
  },

  // Sleeping Pads
  {
    id: "prod-006",
    name: "Klymit Static V Sleeping Pad",
    price: 44.99,
    rating: 4.5,
    amazonUrl: "https://www.amazon.com/dp/B0PROD006?tag=camprally-20",
    category: "Sleeping Pads",
    description:
      "V-chamber design limits air movement for better comfort. Packs down to the size of a water bottle.",
  },
  {
    id: "prod-007",
    name: "Hikenture Ultralight Sleeping Pad",
    price: 35.99,
    rating: 4.3,
    amazonUrl: "https://www.amazon.com/dp/B0PROD007?tag=camprally-20",
    category: "Sleeping Pads",
    description:
      "Self-inflating pad with R-value of 2.5. Weighs just 14.5 oz for backpacking trips.",
  },

  // Cookware
  {
    id: "prod-008",
    name: "Stanley Adventure Camp Cook Set",
    price: 29.99,
    rating: 4.6,
    amazonUrl: "https://www.amazon.com/dp/B0PROD008?tag=camprally-20",
    category: "Cookware",
    description:
      "Stainless steel nesting cook set with 24 oz pot, two 10 oz cups, and vented lid that doubles as a pan.",
  },
  {
    id: "prod-009",
    name: "MalloMe Camping Cookware Mess Kit",
    price: 22.99,
    rating: 4.4,
    amazonUrl: "https://www.amazon.com/dp/B0PROD009?tag=camprally-20",
    category: "Cookware",
    description:
      "10-piece anodized aluminum cook set including pots, pans, plates, and folding utensils in a mesh bag.",
  },
  {
    id: "prod-010",
    name: "GSI Outdoors Cascadian 1-Person Table Set",
    price: 18.99,
    rating: 4.2,
    amazonUrl: "https://www.amazon.com/dp/B0PROD010?tag=camprally-20",
    category: "Cookware",
    description:
      "Compact single-person dining set with plate, bowl, and insulated mug. BPA-free and dishwasher safe.",
  },

  // Stoves
  {
    id: "prod-011",
    name: "Coleman Classic Propane Stove",
    price: 54.99,
    rating: 4.6,
    amazonUrl: "https://www.amazon.com/dp/B0PROD011?tag=camprally-20",
    category: "Stoves",
    description:
      "Two independently adjustable burners delivering 20,000 total BTUs. Wind-blocking panels included.",
  },
  {
    id: "prod-012",
    name: "Etekcity Ultralight Portable Backpacking Stove",
    price: 12.99,
    rating: 4.4,
    amazonUrl: "https://www.amazon.com/dp/B0PROD012?tag=camprally-20",
    category: "Stoves",
    description:
      "Piezo ignition canister stove weighing just 3.9 oz. Boils water in under 3 minutes.",
  },
  {
    id: "prod-013",
    name: "Camp Chef Explorer 2-Burner Stove",
    price: 99.99,
    rating: 4.7,
    amazonUrl: "https://www.amazon.com/dp/B0PROD013?tag=camprally-20",
    category: "Stoves",
    description:
      "Restaurant-quality 30,000 BTU burners with matchless ignition and a 3-sided windscreen.",
  },

  // Lighting
  {
    id: "prod-014",
    name: "Vont 4-Pack LED Camping Lanterns",
    price: 14.99,
    rating: 4.6,
    amazonUrl: "https://www.amazon.com/dp/B0PROD014?tag=camprally-20",
    category: "Lighting",
    description:
      "Collapsible, military-grade lanterns with 30-hour runtime. Perfect for emergencies and camping.",
  },
  {
    id: "prod-015",
    name: "Black Diamond Spot 400 Headlamp",
    price: 39.99,
    rating: 4.5,
    amazonUrl: "https://www.amazon.com/dp/B0PROD015?tag=camprally-20",
    category: "Lighting",
    description:
      "400-lumen headlamp with red night vision mode and waterproof IP67 rating for all conditions.",
  },
  {
    id: "prod-016",
    name: "LuminAID PackLite Solar Lantern",
    price: 24.99,
    rating: 4.3,
    amazonUrl: "https://www.amazon.com/dp/B0PROD016?tag=camprally-20",
    category: "Lighting",
    description:
      "Inflatable solar-powered lantern that packs flat. Provides up to 24 hours of LED light.",
  },

  // Furniture
  {
    id: "prod-017",
    name: "KingCamp Low Sling Folding Chair",
    price: 39.99,
    rating: 4.3,
    amazonUrl: "https://www.amazon.com/dp/B0PROD017?tag=camprally-20",
    category: "Furniture",
    description:
      "Lightweight mesh camp chair with cup holder and carry bag. Supports up to 300 lbs.",
  },
  {
    id: "prod-018",
    name: "Trekology Ultralight Camping Table",
    price: 32.99,
    rating: 4.4,
    amazonUrl: "https://www.amazon.com/dp/B0PROD018?tag=camprally-20",
    category: "Furniture",
    description:
      "Foldable aluminum table weighing under 2 lbs. Sets up in seconds with no assembly required.",
  },

  // Tools
  {
    id: "prod-019",
    name: "Gerber Suspension-NXT Multi-Tool",
    price: 34.99,
    rating: 4.5,
    amazonUrl: "https://www.amazon.com/dp/B0PROD019?tag=camprally-20",
    category: "Tools",
    description:
      "15-tool multi-tool with spring-loaded pliers and an outboard knife blade for easy one-hand opening.",
  },
  {
    id: "prod-020",
    name: "Fiskars X7 Hatchet",
    price: 29.99,
    rating: 4.7,
    amazonUrl: "https://www.amazon.com/dp/B0PROD020?tag=camprally-20",
    category: "Tools",
    description:
      "14-inch hatchet with hardened forged steel blade. Ideal for splitting kindling at the campsite.",
  },
  {
    id: "prod-021",
    name: "Rhino USA Folding Survival Shovel",
    price: 19.99,
    rating: 4.2,
    amazonUrl: "https://www.amazon.com/dp/B0PROD021?tag=camprally-20",
    category: "Tools",
    description:
      "Compact tri-fold shovel with serrated edge. Carbon steel construction with carrying pouch.",
  },

  // Water Filtration
  {
    id: "prod-022",
    name: "Sawyer Products Squeeze Water Filter",
    price: 37.99,
    rating: 4.7,
    amazonUrl: "https://www.amazon.com/dp/B0PROD022?tag=camprally-20",
    category: "Water Filtration",
    description:
      "Filters up to 100,000 gallons removing 99.99999% of bacteria. Weighs just 3 oz.",
  },
  {
    id: "prod-023",
    name: "LifeStraw Personal Water Filter",
    price: 17.99,
    rating: 4.6,
    amazonUrl: "https://www.amazon.com/dp/B0PROD023?tag=camprally-20",
    category: "Water Filtration",
    description:
      "Award-winning straw filter rated for 1,000 gallons. No batteries, moving parts, or chemicals.",
  },

  // Navigation
  {
    id: "prod-024",
    name: "Suunto A-10 Compass",
    price: 19.99,
    rating: 4.4,
    amazonUrl: "https://www.amazon.com/dp/B0PROD024?tag=camprally-20",
    category: "Navigation",
    description:
      "Reliable baseplate compass with balanced needle and fixed declination correction scale.",
  },
  {
    id: "prod-025",
    name: "Garmin eTrex 22x Handheld GPS",
    price: 99.99,
    rating: 4.3,
    amazonUrl: "https://www.amazon.com/dp/B0PROD025?tag=camprally-20",
    category: "Navigation",
    description:
      "Rugged GPS with preloaded TopoActive maps and 25-hour battery life on 2 AA batteries.",
  },

  // Clothing
  {
    id: "prod-026",
    name: "Frogg Toggs Ultra-Lite Rain Suit",
    price: 19.99,
    rating: 4.1,
    amazonUrl: "https://www.amazon.com/dp/B0PROD026?tag=camprally-20",
    category: "Clothing",
    description:
      "Lightweight waterproof-breathable rain jacket and pants combo. Packs into its own stuff sack.",
  },
  {
    id: "prod-027",
    name: "Darn Tough Hiker Micro Crew Socks",
    price: 23.99,
    rating: 4.8,
    amazonUrl: "https://www.amazon.com/dp/B0PROD027?tag=camprally-20",
    category: "Clothing",
    description:
      "Merino wool cushion socks with lifetime guarantee. Moisture-wicking and naturally odor resistant.",
  },

  // Accessories
  {
    id: "prod-028",
    name: "Nalgene Wide Mouth 32oz Water Bottle",
    price: 14.99,
    rating: 4.7,
    amazonUrl: "https://www.amazon.com/dp/B0PROD028?tag=camprally-20",
    category: "Accessories",
    description:
      "BPA-free Tritan bottle that survives drops and freezing. Graduated markings for easy measuring.",
  },
  {
    id: "prod-029",
    name: "Sea to Summit Dry Sack 8L",
    price: 16.99,
    rating: 4.5,
    amazonUrl: "https://www.amazon.com/dp/B0PROD029?tag=camprally-20",
    category: "Accessories",
    description:
      "Ultra-Sil waterproof stuff sack with roll-top closure. Keeps gear dry in any weather.",
  },
  {
    id: "prod-030",
    name: "Coghlan's 50-Pack Waterproof Matches",
    price: 10.99,
    rating: 4.3,
    amazonUrl: "https://www.amazon.com/dp/B0PROD030?tag=camprally-20",
    category: "Accessories",
    description:
      "Wind and waterproof matches that light even when wet. Essential fire-starting backup for any kit.",
  },
];
