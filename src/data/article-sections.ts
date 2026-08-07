/*
 * Per-article structured sections (product grids, spotlights, stats, tables).
 *
 * Extracted from the article template verbatim so other routes can read it.
 * The blog and home cards derive their "from $X" price from the product-grid
 * items here, which is why this is data rather than markup.
 */
export interface CustomSection {
  type: "product-grid" | "checklist" | "callout" | "stats" | "spotlight" | "tips" | "table" | "hack-list";
  title?: string;
  subtitle?: string;
  icon?: string;
  items?: Array<{ label: string; link?: string; icon?: string; category?: string; asin?: string }>;
  checkItems?: string[];
  calloutType?: "save" | "splurge" | "tip" | "warning";
  calloutTitle?: string;
  calloutBody?: string;
  stats?: Array<{ value: string; label: string }>;
  spotlightItem?: { name: string; asin?: string; why: string; category: string };
  tips?: Array<{ title: string; body: string }>;
  rows?: string[][];
}

export const ARTICLE_CUSTOM_SECTIONS: Record<string, CustomSection[]> = {
  "best-camping-tarp-under-30": [
    {
      type: "product-grid",
      title: "Best Camping Tarps Under $30 — Extra Shelter Without the Price Tag — Quick Comparison",
      items: [
        { label: "RAINDEWAY Tarp 8x10 Feet", category: "", icon: "🏕️", asin: "B0DSSLFGJ8", link: "https://www.amazon.com/dp/B0DSSLFGJ8?tag=camprally-20" },
        { label: "Amazon Basics Waterproof Multipurp", category: "", icon: "🏕️", asin: "B0748HGDVD", link: "https://www.amazon.com/dp/B0748HGDVD?tag=camprally-20" },
        { label: "CARTMAN 8x10Ft Multipurpose Waterp", category: "", icon: "🏕️", asin: "B089PY2LCV", link: "https://www.amazon.com/dp/B089PY2LCV?tag=camprally-20" },
        { label: "CARTMAN 6x8Ft Multipurpose Waterpr", category: "", icon: "🏕️", asin: "B0BTLZBWQK", link: "https://www.amazon.com/dp/B0BTLZBWQK?tag=camprally-20" },
        { label: "CARTMAN 10x12Ft Multipurpose Water", category: "", icon: "🏕️", asin: "B089Q18CCZ", link: "https://www.amazon.com/dp/B089Q18CCZ?tag=camprally-20" },
        { label: "Unigear Hammock Rain Fly Waterproo", category: "", icon: "🏕️", asin: "B07F8854P2", link: "https://www.amazon.com/dp/B07F8854P2?tag=camprally-20" },
      ]
    },
  ],
  "camping-with-dogs-checklist": [
    {
      type: "product-grid",
      title: "Complete Camping With Dogs Checklist — What to Bring, What to Skip — Quick Comparison",
      items: [
        { label: "Cibaabo Dog Water Bottle Portable ", category: "", icon: "🏕️", asin: "B0C7WHRQ4Y", link: "https://www.amazon.com/dp/B0C7WHRQ4Y?tag=camprally-20" },
        { label: "Kytely Large Collapsible Dog Bowls", category: "", icon: "🏕️", asin: "B08925JCB9", link: "https://www.amazon.com/dp/B08925JCB9?tag=camprally-20" },
        { label: "Original Doggy Bag™ Dog Travel Bag", category: "", icon: "🏕️", asin: "B09GQRK5GL", link: "https://www.amazon.com/dp/B09GQRK5GL?tag=camprally-20" },
        { label: "6 Set Dog Travel Bag", category: "", icon: "🏕️", asin: "B08XJ2QLZ2", link: "https://www.amazon.com/dp/B08XJ2QLZ2?tag=camprally-20" },
        { label: "FXW Dog Playpen Storage Bag", category: "", icon: "🏕️", asin: "B0C6KCV3BS", link: "https://www.amazon.com/dp/B0C6KCV3BS?tag=camprally-20" },
        { label: "Wilderdog Dog Bandana with Lightwe", category: "", icon: "🏕️", asin: "B0C5KBDBLL", link: "https://www.amazon.com/dp/B0C5KBDBLL?tag=camprally-20" },
      ]
    },
  ],
  "best-camp-kitchen-organization": [
    {
      type: "product-grid",
      title: "Best Camp Kitchen Organization — Pack, Cook, and Clean Smarter — Quick Comparison",
      items: [
        { label: "GCI OUTDOOR Slim-Fold Cook Station", category: "", icon: "🏕️", asin: "B00U9BHKM6", link: "https://www.amazon.com/dp/B00U9BHKM6?tag=camprally-20" },
        { label: "Kitchen Gadgets Set", category: "", icon: "🏕️", asin: "B08CXQ1HV9", link: "https://www.amazon.com/dp/B08CXQ1HV9?tag=camprally-20" },
        { label: "Coleman Triton 2-Burner Propane St", category: "", icon: "🏕️", asin: "B09HN1C1YJ", link: "https://www.amazon.com/dp/B09HN1C1YJ?tag=camprally-20" },
        { label: "GCI OUTDOOR Master Cook Station | ", category: "", icon: "🏕️", asin: "B07C3WK867", link: "https://www.amazon.com/dp/B07C3WK867?tag=camprally-20" },
        { label: "HOSHANHO Butcher Knife Set", category: "", icon: "🏕️", asin: "B0DB4W8FB1", link: "https://www.amazon.com/dp/B0DB4W8FB1?tag=camprally-20" },
        { label: "Folding Camping Table", category: "", icon: "🏕️", asin: "B0DPW7RFC7", link: "https://www.amazon.com/dp/B0DPW7RFC7?tag=camprally-20" },
      ]
    },
  ],
  "best-portable-power-station-camping-under-200": [
    {
      type: "product-grid",
      title: "Best Portable Power Stations for Camping Under $200 — Quick Comparison",
      items: [
        { label: "Portable Power Station 330W", category: "", icon: "🏕️", asin: "B0GHQCKZBN", link: "https://www.amazon.com/dp/B0GHQCKZBN?tag=camprally-20" },
        { label: "Anker 521 Portable Power Station U", category: "", icon: "🏕️", asin: "B09FF46FQ9", link: "https://www.amazon.com/dp/B09FF46FQ9?tag=camprally-20" },
        { label: "ALLWEI Portable Power Station 300W", category: "", icon: "🏕️", asin: "B08CXN4TZR", link: "https://www.amazon.com/dp/B08CXN4TZR?tag=camprally-20" },
        { label: "VTOMAN FlashSpeed 300 Portable Pow", category: "", icon: "🏕️", asin: "B0DCJX9D71", link: "https://www.amazon.com/dp/B0DCJX9D71?tag=camprally-20" },
        { label: "DaranEner Portable Power Station", category: "", icon: "🏕️", asin: "B0C6K5ZPNJ", link: "https://www.amazon.com/dp/B0C6K5ZPNJ?tag=camprally-20" },
        { label: "EBL Portable Power Station 500w(Pe", category: "", icon: "🏕️", asin: "B0DPFL1CH3", link: "https://www.amazon.com/dp/B0DPFL1CH3?tag=camprally-20" },
      ]
    },
  ],
  "camping-meal-plans-budget-50": [
    {
      type: "product-grid",
      title: "7 Days of Budget Camping Meals — $50 Total Food Budget — Quick Comparison",
      items: [
        { label: "Peak Refuel Sweet Pork and Rice Fr", category: "", icon: "🏕️", asin: "B07BRBB75X", link: "https://www.amazon.com/dp/B07BRBB75X?tag=camprally-20" },
        { label: "Mountain House Beef Lasagna & Free", category: "", icon: "🏕️", asin: "B084BTW6LT", link: "https://www.amazon.com/dp/B084BTW6LT?tag=camprally-20" },
        { label: "Weekend Camping Cookbook: Over 100", category: "", icon: "🏕️", asin: "1497102936", link: "https://www.amazon.com/dp/1497102936?tag=camprally-20" },
      ]
    },
  ],
  "dispersed-camping-beginners-guide": [
    {
      type: "product-grid",
      title: "Dispersed Camping for Beginners — How to Camp Free on Public Land — Quick Comparison",
      items: [
        { label: "FLY2SKY Portable LED Gear Camping ", category: "", icon: "🏕️", asin: "B07MKBKN4H", link: "https://www.amazon.com/dp/B07MKBKN4H?tag=camprally-20" },
        { label: "Lepro LED Camping Lantern with 3 L", category: "", icon: "🏕️", asin: "B083TXB5QY", link: "https://www.amazon.com/dp/B083TXB5QY?tag=camprally-20" },
        { label: "Eveready LED Camping Lantern X-250", category: "", icon: "🏕️", asin: "B0CW4QLRPQ", link: "https://www.amazon.com/dp/B0CW4QLRPQ?tag=camprally-20" },
        { label: "National Forest Camping: Directory", category: "", icon: "🏕️", asin: "1885464851", link: "https://www.amazon.com/dp/1885464851?tag=camprally-20" },
        { label: "4-Pack Solar Camping Lanterns", category: "", icon: "🏕️", asin: "B0DYV7KX92", link: "https://www.amazon.com/dp/B0DYV7KX92?tag=camprally-20" },
        { label: "Fire-Maple Fixed Star 1 Backpackin", category: "", icon: "🏕️", asin: "B07F2VP353", link: "https://www.amazon.com/dp/B07F2VP353?tag=camprally-20" },
      ]
    },
  ],
  "camping-fire-starting-guide": [
    {
      type: "product-grid",
      title: "Fire Starting for Campers — What Works, What Doesn't, What Burns — Quick Comparison",
      items: [
        { label: "Superior Trading Fire Starter Pods", category: "", icon: "🏕️", asin: "B00QJOC2RK", link: "https://www.amazon.com/dp/B00QJOC2RK?tag=camprally-20" },
        { label: "Pocket Bellows - Weatherproof Coll", category: "", icon: "🏕️", asin: "B00LDSW5BA", link: "https://www.amazon.com/dp/B00LDSW5BA?tag=camprally-20" },
        { label: "Fire Starter - 3/8\" Thick Ferro Ro", category: "", icon: "🏕️", asin: "B083RH93C6", link: "https://www.amazon.com/dp/B083RH93C6?tag=camprally-20" },
        { label: "Duraflame Fire Starter Bundle – Fi", category: "", icon: "🏕️", asin: "B07VH7MWZM", link: "https://www.amazon.com/dp/B07VH7MWZM?tag=camprally-20" },
        { label: "Procamptek Fast Fire Stick - Survi", category: "", icon: "🏕️", asin: "B07MP4DS32", link: "https://www.amazon.com/dp/B07MP4DS32?tag=camprally-20" },
        { label: "2lb Fatwood Fire Starter Sticks | ", category: "", icon: "🏕️", asin: "B09C2L8LD7", link: "https://www.amazon.com/dp/B09C2L8LD7?tag=camprally-20" },
      ]
    },
  ],
  "how-to-camp-in-rain": [
    {
      type: "product-grid",
      title: "How to Camp in Rain and Still Have a Great Time — Quick Comparison",
      items: [
        { label: "Emergency Blanket Mylar Thermal Sp", category: "", icon: "🏕️", asin: "B098KJMMGC", link: "https://www.amazon.com/dp/B098KJMMGC?tag=camprally-20" },
        { label: "FREE SOLDIER Waterproof Camping Ta", category: "", icon: "🏕️", asin: "B01HO15DGS", link: "https://www.amazon.com/dp/B01HO15DGS?tag=camprally-20" },
        { label: "FROGG TOGGS Ultra-Lite2 Rain Suit", category: "", icon: "🏕️", asin: "B0BZFTL523", link: "https://www.amazon.com/dp/B0BZFTL523?tag=camprally-20" },
        { label: "Rainleaf Microfiber Towel Quick Dr", category: "", icon: "🏕️", asin: "B01K1TX3DK", link: "https://www.amazon.com/dp/B01K1TX3DK?tag=camprally-20" },
        { label: "Amazon Basics Waterproof Multipurp", category: "", icon: "🏕️", asin: "B0748HGDVD", link: "https://www.amazon.com/dp/B0748HGDVD?tag=camprally-20" },
        { label: "PREPARED4X Emergency Mylar Poncho ", category: "", icon: "🏕️", asin: "B0BKH8BJ3Q", link: "https://www.amazon.com/dp/B0BKH8BJ3Q?tag=camprally-20" },
      ]
    },
  ],
  "best-hiking-boots-camping-under-100": [
    {
      type: "product-grid",
      title: "Best Hiking Boots for Camping Under $100 — Tested on Real Trails — Quick Comparison",
      items: [
        { label: "Yebing Merino Wool Hiking Socks fo", category: "", icon: "🏕️", link: "https://www.amazon.com/dp/B0CGV7Z4XG?tag=camprally-20" },
        { label: "Columbia Newton Ridge Plus II Sued", category: "", icon: "🏕️", link: "https://www.amazon.com/dp/B0CLWBTMBN?tag=camprally-20" },
        { label: "Merrell Women's Moab 3 Mid Waterpr", category: "", icon: "🏕️", link: "https://www.amazon.com/dp/B0987Z4CHV?tag=camprally-20" },
        { label: "Columbia Transverse™ Hike Waterpro", category: "", icon: "🏕️", link: "https://www.amazon.com/dp/B0CLWLDM39?tag=camprally-20" },
        { label: "Columbia womens Newton Ridge Plus ", category: "", icon: "🏕️", link: "https://www.amazon.com/dp/B0CLWLBB9P?tag=camprally-20" },
        { label: "Columbia Women's Newton Ridge Plus", category: "", icon: "🏕️", link: "https://www.amazon.com/dp/B0CLVYVP56?tag=camprally-20" },
      ]
    },
  ],
  "how-to-camp-in-hot-weather": [
    {
      type: "product-grid",
      title: "How to Camp in Hot Weather Without Melting — Fan, Hydration, and Shade Strategies — Quick Comparison",
      items: [
        { label: "20000mAh Auto-Oscillating Battery ", category: "", icon: "🏕️", link: "https://www.amazon.com/dp/B0BJV7J24Q?tag=camprally-20" },
        { label: "Nalgene Wide Mouth Water Bottle", category: "", icon: "🏕️", link: "https://www.amazon.com/dp/B09CH8W31W?tag=camprally-20" },
        { label: "Igloo BMX 52 Quart Cooler - Carbon", category: "", icon: "🏕️", link: "https://www.amazon.com/dp/B01M6XFW5P?tag=camprally-20" },
        { label: "Featwell 20000mAh Portable Fan wit", category: "", icon: "🏕️", link: "https://www.amazon.com/dp/B0F13TH5P4?tag=camprally-20" },
        { label: "Squeeze Water Filtration System", category: "", icon: "🏕️", link: "https://www.amazon.com/dp/B0DVHL8FG4?tag=camprally-20" },
        { label: "AJVV Camping Fan with Light", category: "", icon: "🏕️", link: "https://www.amazon.com/dp/B0DS5CRTGK?tag=camprally-20" },
      ]
    },
  ],
  "budget-camping-accessories-under-20": [
    {
      type: "product-grid",
      title: "Budget Camping Accessories Under $20 — Quick Comparison",
      items: [
        { label: "Ayaport Campsite Storage Strap Ten", category: "", icon: "🏕️", link: "https://www.amazon.com/dp/B0DT3X133H?tag=camprally-20" },
        { label: "LifeStraw Personal — Water Filter ", category: "", icon: "🏕️", link: "https://www.amazon.com/dp/B006QF3TW4?tag=camprally-20" },
        { label: "QIO CHUANG Emergency Mylar Thermal", category: "", icon: "🏕️", link: "https://www.amazon.com/dp/B07GLCYR5S?tag=camprally-20" },
        { label: "Emergency Blanket Mylar Thermal Sp", category: "", icon: "🏕️", link: "https://www.amazon.com/dp/B098KJMMGC?tag=camprally-20" },
        { label: "SZHLUX Camping Hammock Double & Si", category: "", icon: "🏕️", link: "https://www.amazon.com/dp/B09VGNJTPW?tag=camprally-20" },
        { label: "Outdoor Knot Cards: 22 Knots – Cam", category: "", icon: "🏕️", link: "https://www.amazon.com/dp/B07VVT97RB?tag=camprally-20" },
      ]
    },
  ],
  "best-budget-tents-under-100": [
    {
      type: "product-grid",
      title: "Best Budget Tents Under $100 - 2026 Reviews — Quick Comparison",
      items: [
        { label: "2/4 Person Camping Tent Lightweigh", category: "", icon: "🏕️", link: "https://www.amazon.com/dp/B08RBW95BC?tag=camprally-20" },
        { label: "Amazon Basics Camping Tent", category: "", icon: "🏕️", link: "https://www.amazon.com/dp/B077Y8DLSN?tag=camprally-20" },
        { label: "Forceatt Camping Tent 2/3/4 Person", category: "", icon: "🏕️", link: "https://www.amazon.com/dp/B083QX3D3Z?tag=camprally-20" },
        { label: "Camping Tent 2-4 Person", category: "", icon: "🏕️", link: "https://www.amazon.com/dp/B0CNQPR1CS?tag=camprally-20" },
        { label: "Coleman Sundome Camping Tent with ", category: "", icon: "🏕️", link: "https://www.amazon.com/dp/B0D7QLQNS5?tag=camprally-20" },
      ]
    },
  ],
  "best-camping-chairs-tailgating": [
    {
      type: "product-grid",
      title: "Best Camping Chairs Under $50 for Tailgating and Campfires — Quick Comparison",
      items: [
        { label: "Coleman Portable Camping Chair wit", category: "", icon: "🏕️", link: "https://www.amazon.com/dp/B0033990ZQ?tag=camprally-20" },
        { label: "ONETIGRIS Tigerblade Camping Chair", category: "", icon: "🏕️", link: "https://www.amazon.com/dp/B0CQJR8NLW?tag=camprally-20" },
        { label: "VEVOR Oversized Camping Folding Ch", category: "", icon: "🏕️", link: "https://www.amazon.com/dp/B0C9MF8L3N?tag=camprally-20" },
        { label: "EMERIT Camping Chair", category: "", icon: "🏕️", link: "https://www.amazon.com/dp/B0DFPH7K8C?tag=camprally-20" },
        { label: "Amazon Basics Camping Chair", category: "", icon: "🏕️", link: "https://www.amazon.com/dp/B074YRN643?tag=camprally-20" },
        { label: "Cascade Mountain Tech Folding Camp", category: "", icon: "🏕️", link: "https://www.amazon.com/dp/B01EVQ1Y6W?tag=camprally-20" },
      ]
    },
  ],
  "best-camping-coolers-under-100": [
    {
      type: "product-grid",
      title: "Best Camping Coolers Under $100 in 2026 — Stay Cold, Stay Happy — Quick Comparison",
      items: [
        { label: "Klein Tools 55600 Work Cooler", category: "", icon: "🏕️", link: "https://www.amazon.com/dp/B06XGJTTRY?tag=camprally-20" },
        { label: "ENGEL 13qt Leak-Proof", category: "", icon: "🏕️", link: "https://www.amazon.com/dp/B00BD26JMM?tag=camprally-20" },
        { label: "Igloo Hard Cooler | Profile Series", category: "", icon: "🏕️", link: "https://www.amazon.com/dp/B0GP2JLJT3?tag=camprally-20" },
        { label: "Igloo Hard Cooler | Profile Series", category: "", icon: "🏕️", link: "https://www.amazon.com/dp/B0GP3M7SSR?tag=camprally-20" },
        { label: "Igloo Tag Along Too Coolers | Insu", category: "", icon: "🏕️", link: "https://www.amazon.com/dp/B0CPM9BMWG?tag=camprally-20" },
      ]
    },
  ],
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
        { label: "Coleman Sundome 2P Tent", category: "Shelter", icon: "⛺", link: "https://www.amazon.com/dp/B014LSDUA8?tag=camprally-20" },
        { label: "Coleman Brazos 30°F Sleeping Bag", category: "Sleeping Bag", icon: "🛏️", link: "https://www.amazon.com/dp/B0DHJL8CMJ?tag=camprally-20" },
        { label: "Klymit Static V Sleeping Pad", category: "Sleeping Pad", icon: "💤", link: "https://www.amazon.com/dp/B082429QGK?tag=camprally-20" },
        { label: "Stanley Adventure Camp Cook Set", category: "Cooking", icon: "🍳", link: "https://www.amazon.com/dp/B0C79G8L6S?tag=camprally-20" },
        { label: "Etekcity Ultralight Stove", category: "Stove", icon: "🔥", link: "https://www.amazon.com/dp/B07VYNRKCS?tag=camprally-20" },
        { label: "Vont 4-Pack LED Lanterns", category: "Lighting", icon: "💡", link: "https://www.amazon.com/dp/B00NPLSZF8?tag=camprally-20" },
        { label: "Nalgene 32oz Water Bottle", category: "Water", icon: "💧", link: "https://www.amazon.com/dp/B09CH8W31W?tag=camprally-20" },
      ]
    },
    {
      type: "callout",
      calloutType: "save",
      calloutTitle: "SAVE: Tent",
      calloutBody: "The Sundome outperforms tents several times its price in weather protection. Don't overthink this."
    },
    {
      type: "callout",
      calloutType: "splurge",
      calloutTitle: "SPLURGE: Sleeping Bag",
      calloutBody: "Your sleeping bag is the most personal item. The Brazos is decent, but if you camp in colder weather, consider the Teton Sports Celsius (rated to 0°F)."
    },
    {
      type: "callout",
      calloutType: "save",
      calloutTitle: "SAVE: Stove",
      calloutBody: "The Etekcity canister stove boils water in 3 minutes. Expensive stoves do the same thing 30 seconds faster. Not worth the money."
    },
    {
      type: "spotlight",
      spotlightItem: {
        name: "Coleman Sundome 2P",
        asin: "B014LSDUA8",
        why: "The benchmark budget tent. WeatherTec™ system, 10-minute setup, and genuine 2-person capacity. Backed by Coleman reliability.",
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


  "best-budget-sleeping-bags-cold-weather": [
    {
      type: "spotlight",
      spotlightItem: {
        name: "Teton Sports Celsius Regular",
        asin: "B0D88VH3XN",
        why: "Genuine 0°F cold-weather performance at a fraction of the price. Mummy design traps heat efficiently, snag-free zipper, and lifetime warranty. The obvious choice for cold nights.",
        category: "Sleeping Bag"
      }
    },
    {
      type: "product-grid",
      title: "Cold Weather Picks",
      items: [
        { label: "Teton Sports Celsius (0°F)", category: "Best Overall", icon: "🥶", link: "https://www.amazon.com/dp/B0D88VH3XN?tag=camprally-20" },
        { label: "Coleman Brazos 30°F", category: "Most Affordable", icon: "💰", link: "https://www.amazon.com/dp/B0DHJL8CMJ?tag=camprally-20" },
        { label: "Oaskys 3-Season", category: "Ultralight", icon: "🪶", link: "https://www.amazon.com/s?k=oaskys+3+season+sleeping+bag&tag=camprally-20" },
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
        asin: "B0C79G8L6S",
        why: "24oz pot, two cups, and lid/pan nest perfectly. Stainless steel handles don't melt over open flame. The best value in camping cookware. Period.",
        category: "Cookware"
      }
    },
    {
      type: "product-grid",
      title: "Cookware Picks",
      items: [
        { label: "Stanley Adventure Camp Cook Set", category: "Best Pick", icon: "🍳", link: "https://www.amazon.com/dp/B0C79G8L6S?tag=camprally-20" },
        { label: "MalloMe Camping Cookware Mess Kit", category: "Budget Runner-Up", icon: "💰", link: "https://www.amazon.com/s?k=MalloMe+camping+cookware+mess+kit&tag=camprally-20" },
        { label: "GSI Cascadian 1-Person Table Set", category: "Solo", icon: "🎒", link: "https://www.amazon.com/dp/B001LRPSUS?tag=camprally-20" },
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
        asin: "B09NQK2581",
        why: "400 lumens handles trail running, camp chores, and reading. PowerTap technology switches modes instantly. IPX67 waterproof and 200+ hour battery life on low.",
        category: "Headlamp"
      }
    },
    {
      type: "product-grid",
      title: "Lighting Picks",
      items: [
        { label: "Black Diamond Spot 400", category: "Headlamp", icon: "🔦", link: "https://www.amazon.com/dp/B09NQK2581?tag=camprally-20" },
        { label: "Vont 4-Pack LED Lanterns", category: "Lantern 4-pack", icon: "🏮", link: "https://www.amazon.com/dp/B00NPLSZF8?tag=camprally-20" },
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
        asin: "B082429QGK",
        why: "V-chamber design limits air movement and heat loss. 4.7/5 rating across 10,000+ reviews. Packs to water bottle size with lifetime warranty. The gold standard of budget pads.",
        category: "Sleeping Pad"
      }
    },
    {
      type: "product-grid",
      title: "Sleeping Pad Picks",
      items: [
        { label: "Klymit Static V", category: "Best Pick", icon: "💤", link: "https://www.amazon.com/dp/B082429QGK?tag=camprally-20" },
        { label: "Hikenture Ultralight Sleeping Pad", category: "Self-Inflating", icon: "🎈", link: "https://www.amazon.com/dp/B09YY89GT6?tag=camprally-20" },
        { label: "Thermarest Z Lite Sol", category: "Foam Classic", icon: "🧱", link: "https://www.amazon.com/dp/B0CN4R2QS2?tag=camprally-20" },
        { label: "Amazon Basics Foam Pad", category: "Backup", icon: "🪵", link: "https://www.amazon.com/dp/B0FD97YGX6?tag=camprally-20" },
      ]
    },
    {
      type: "callout",
      calloutType: "warning",
      calloutTitle: "Your Sleeping Pad Is More Important Than Your Sleeping Bag",
      calloutBody: "80% of your body heat escapes through contact with the ground. An expensive sleeping bag on a bare tarp will leave you colder than a budget bag on a quality pad."
    },
  ],

  "budget-portable-camping-stoves-compared": [
    {
      type: "spotlight",
      spotlightItem: {
        name: "Etekcity Ultralight Portable Stove",
        asin: "B07VYNRKCS",
        why: "Piezo ignition means no lighter needed. Adjustable flame gives cooking control. 3.9 oz and folds to pocket size. This stove rivals units many times its price.",
        category: "Stove"
      }
    },
    {
      type: "product-grid",
      title: "Stove Picks",
      items: [
        { label: "Etekcity Ultralight Portable Stove", category: "Best Budget", icon: "🔥", link: "https://www.amazon.com/dp/B07VYNRKCS?tag=camprally-20" },
        { label: "Coleman Classic Propane Stove", category: "Upgrade Pick", icon: "🍳", link: "https://www.amazon.com/dp/B00005OU9D?tag=camprally-20" },
        { label: "Jetboil Zip", category: "Backpacking", icon: "🎒", link: "https://www.amazon.com/dp/B004UVPDUM?tag=camprally-20" },
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
        asin: "B0DVHL8FG4",
        why: "0.1-micron absolute pore size removes 99.99999% of bacteria and 99.9999% of protozoa. 100,000 gallon lifespan = essentially forever. Weighs 3 oz.",
        category: "Water Filter"
      }
    },
    {
      type: "product-grid",
      title: "Water Filtration Picks",
      items: [
        { label: "Sawyer Squeeze Filter", category: "Best Pick", icon: "💧", link: "https://www.amazon.com/dp/B0DVHL8FG4?tag=camprally-20" },
        { label: "LifeStraw Personal Water Filter", category: "Budget Pick", icon: "🥤", link: "https://www.amazon.com/dp/B0FDXYKJYF?tag=camprally-20" },
      ]
    },
    {
      type: "callout",
      calloutType: "warning",
      calloutTitle: "Don't: The Bleach Method",
      calloutBody: "8 drops per gallon, 30-minute wait, tastes terrible, dosage is imprecise. Just buy a filter. Never risk giardia to save a few dollars."
    },
  ],

  "best-budget-gps-compass-hiking": [
    {
      type: "spotlight",
      spotlightItem: {
        name: "Suunto A-10 Compass",
        asin: "B08PDDPX28",
        why: "Liquid-filled needle stabilizes quickly, baseplate markings work with any map. Balanced for northern hemisphere, lifetime warranty. The benchmark for budget compasses.",
        category: "Compass"
      }
    },
    {
      type: "product-grid",
      title: "Navigation Picks",
      items: [
        { label: "Suunto A-10 Compass", category: "Compass", icon: "🧭", link: "https://www.amazon.com/dp/B08PDDPX28?tag=camprally-20" },
        { label: "Garmin eTrex 22x", category: "GPS", icon: "📍", link: "https://www.amazon.com/dp/B07RTD2PMT?tag=camprally-20" },
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
        asin: "B07DD69QN3",
        why: "15 tools cover every camp scenario. Spring-loaded pliers reduce hand fatigue, outside-accessible blades, butterfly opening is smooth. The benchmark budget multi-tool.",
        category: "Multi-Tool"
      }
    },
    {
      type: "product-grid",
      title: "Multi-Tool Picks",
      items: [
        { label: "Gerber Suspension-NXT", category: "Best Pick", icon: "🔧", link: "https://www.amazon.com/dp/B07DD69QN3?tag=camprally-20" },
        { label: "Amazon Basics Multi-Tool", category: "Budget Pick", icon: "💰", link: "https://www.amazon.com/dp/B07TQ86781?tag=camprally-20" },
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
        asin: "B094D5QJV5",
        why: "Swedish high-carbon steel takes a razor edge and holds it. Rubber handle won't slip, full tang construction is nearly indestructible. Fire striker notch on spine. Buy two.",
        category: "Knife"
      }
    },
    {
      type: "product-grid",
      title: "Knife Picks",
      items: [
        { label: "Mora Companion", category: "Best Pick", icon: "🔪", link: "https://www.amazon.com/dp/B094D5QJV5?tag=camprally-20" },
        { label: "OutdoorElement Indus Review Knife", category: "Budget Pick", icon: "💰", link: "https://www.amazon.com/s?k=outdoor+element+camp+knife&tag=camprally-20" },
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
        asin: "B0BZFTL523",
        why: "Two-piece suit (jacket + pants) stuffs into its own pocket and deploys in seconds. 5,000mm waterproofing handles heavy rain. Breathable reduces interior condensation.",
        category: "Rain Gear"
      }
    },
    {
      type: "product-grid",
      title: "Rain Gear Picks",
      items: [
        { label: "Frogg Toggs Ultra-Lite Rain Suit", category: "Best Pick", icon: "🌧️", link: "https://www.amazon.com/dp/B0BZFTL523?tag=camprally-20" },
        { label: "Frogg Toggs Ultra-Lite Rain Suit", category: "Budget Pick", icon: "🌧️", link: "https://www.amazon.com/dp/B0BZFTL523?tag=camprally-20" },
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
        asin: "B0BF8PRSZL",
        why: "Closer to ground (great for campfires), mesh sides provide airflow. Oversized cup holder, padded armrests, storage pocket. Folds flat for trunk storage.",
        category: "Camp Chair"
      }
    },
    {
      type: "product-grid",
      title: "Chair Picks",
      items: [
        { label: "KingCamp Low Sling Folding Chair", category: "Best Pick", icon: "🪑", link: "https://www.amazon.com/dp/B0BF8PRSZL?tag=camprally-20" },
        { label: "Amazon Basics Folding Camp Chair", category: "Budget Pick", icon: "💰", link: "https://www.amazon.com/dp/B0CZNY3LR8?tag=camprally-20" },
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
        asin: "B0CSD3WQKJ",
        why: "Aluminum surface, sets up in 3 seconds (no assembly). Magnetic legs lock securely. 1.8 lbs, packs to large book size. Carry bag included.",
        category: "Camping Table"
      }
    },
    {
      type: "product-grid",
      title: "Table Picks",
      items: [
        { label: "Trekology Ultralight Camping Table", category: "Best Pick", icon: "🪑", link: "https://www.amazon.com/dp/B0CSD3WQKJ?tag=camprally-20" },
        { label: "Coleman Portable Camping Table", category: "Budget Pick", icon: "💰", link: "https://www.amazon.com/dp/B0CZDRT3F2?tag=camprally-20" },
      ]
    },
    {
      type: "callout",
      calloutType: "tip",
      calloutTitle: "DIY Alternative: Plastic Bins",
      calloutBody: "Stack two plastic storage bins. Instant table: completely free, adjustable height, provides storage underneath. Works surprisingly well for casual car camping."
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
        { label: "iOverlander App", category: "App", icon: "📱", link: "https://www.amazon.com/shop/camprally?tag=camprally-20" },
        { label: "Campendium", category: "Website", icon: "🌐", link: "https://www.amazon.com/shop/camprally?tag=camprally-20" },
        { label: "USDA Forest Service Map", category: "Official", icon: "🏕️", link: "https://www.amazon.com/shop/camprally?tag=camprally-20" },
      ]
    },
    {
      type: "product-grid",
      title: "Favorite Free Camping Regions",
      items: [
        { label: "Colorado National Forests", category: "Mountain", icon: "🏔️", link: "https://www.amazon.com/shop/camprally?tag=camprally-20" },
        { label: "Utah BLM Lands", category: "Desert", icon: "🏜️", link: "https://www.amazon.com/shop/camprally?tag=camprally-20" },
        { label: "California National Forests", category: "Forest", icon: "🌲", link: "https://www.amazon.com/shop/camprally?tag=camprally-20" },
        { label: "New Mexico BLM", category: "Desert", icon: "🌵", link: "https://www.amazon.com/shop/camprally?tag=camprally-20" },
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
        { label: "🌸 Spring (Mar-May)", category: "Best: Southwest", icon: "🌸", link: "https://www.amazon.com/shop/camprally?tag=camprally-20" },
        { label: "☀️ Summer (Jun-Aug)", category: "Best: North", icon: "☀️", link: "https://www.amazon.com/shop/camprally?tag=camprally-20" },
        { label: "🍂 Fall (Sep-Nov)", category: "Best: Everywhere", icon: "🍂", link: "https://www.amazon.com/shop/camprally?tag=camprally-20" },
        { label: "❄️ Winter (Dec-Feb)", category: "Best: Deserts", icon: "❄️", link: "https://www.amazon.com/shop/camprally?tag=camprally-20" },
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
        { label: "🧊 Freeze Your Food", category: "Cooking", icon: "🧊", link: "https://www.amazon.com/shop/camprally?tag=camprally-20" },
        { label: "🧊 Pre-Measure Spices", category: "Cooking", icon: "🧂", link: "https://www.amazon.com/shop/camprally?tag=camprally-20" },
        { label: "💧 Warmed Water Bottle", category: "Sleep", icon: "🛏️", link: "https://www.amazon.com/shop/camprally?tag=camprally-20" },
        { label: "🪵 Double Sleeping Pad", category: "Sleep", icon: "💤", link: "https://www.amazon.com/shop/camprally?tag=camprally-20" },
        { label: "🔥 Char Cloth Hack", category: "Fire", icon: "🔥", link: "https://www.amazon.com/shop/camprally?tag=camprally-20" },
        { label: "🧴 Denture Tablets", category: "Water", icon: "💧", link: "https://www.amazon.com/shop/camprally?tag=camprally-20" },
      ]
    },
    {
      type: "callout",
      calloutType: "tip",
      calloutTitle: "The Newspaper Seating Test",
      calloutBody: "Spread newspaper under your tent. If it gets damp overnight, that's where water pools. Now you know to set up elsewhere. Free site assessment tool."
    },
  ],


  "best-camping-first-aid-kits-under-50": [
    {
      type: "spotlight",
      spotlightItem: {
        name: "Adventure Medical Kits UltraLite .5",
        asin: "B0DV6PDY9R",
        why: "Best organized budget kit. 1.1 lbs, real medical supplies, inner organizer keeps everything in place. Handles the 80% of injuries that actually happen.",
        category: "Our Top Pick"
      }
    },
    {
      type: "callout",
      calloutType: "tip",
      calloutTitle: "Don't Forget the Moleskin",
      calloutBody: "Almost no kit includes enough moleskin. Buy a separate sheet of 9-12 pre-cut 2x2 squares. Apply at the first hot spot — not after the blister forms. This alone saves more trips than any medication."
    },
    {
      type: "product-grid",
      title: "The Three Kits Under $50",
      subtitle: "Pick based on how you camp.",
      items: [
        { label: "Adventure Medical Kits UltraLite .5", category: "Best Overall", icon: "🏆", link: "https://www.amazon.com/dp/B0DV6PDY9R?tag=camprally-20" },
        { label: "Coleman 150-Piece First Aid Kit", category: "Best Value", icon: "💰", link: "https://www.amazon.com/dp/B0DB794BKQ?tag=camprally-20" },
        { label: "Adventure Medical Kits UltraLite .7", category: "Best for Groups", icon: "⭐", link: "https://www.amazon.com/dp/B0DV6NTJBK?tag=camprally-20" },
      ]
    },
  ],

  "best-portable-camping-fans": [
    {
      type: "spotlight",
      spotlightItem: {
        name: "Rechargeable Camping Fan with LED Lantern",
        asin: "B0BJV7J24Q",
        why: "Best balance of features and battery life. 20000mAh runs 40+ hours on low, LED lantern built in, quiet motor, and remote control. The complete package for summer camping.",
        category: "Our Top Pick"
      }
    },
    {
      type: "callout",
      calloutType: "tip",
      calloutTitle: "Charge Before You Leave",
      calloutBody: "These fans all have USB-C charging. Top them off the night before your trip. A 2-hour charge from a 20W adapter gets you most of a full charge on most models."
    },
    {
      type: "product-grid",
      title: "The Best Camping Fans",
      subtitle: "From best overall to best budget.",
      items: [
        { label: "Rechargeable Camping Fan with LED Lantern", category: "Best Overall", icon: "🏆", link: "https://www.amazon.com/dp/B0BJV7J24Q?tag=camprally-20" },
        { label: "Featwell 20000mAh Portable Fan", category: "Best Value", icon: "💰", link: "https://www.amazon.com/dp/B0F13TH5P4?tag=camprally-20" },
        { label: "AJVV Camping Fan with Light and Oscillation", category: "Best for Groups", icon: "⭐", link: "https://www.amazon.com/dp/B0DS5CRTGK?tag=camprally-20" },
        { label: "Camping Fan Rechargeable 20000mAh", category: "Budget Pick", icon: "💸", link: "https://www.amazon.com/dp/B0FCFCNSZH?tag=camprally-20" },
        { label: "ATEngeus USB Desk Fan", category: "Upgrade Pick", icon: "⬆️", link: "https://www.amazon.com/dp/B09WK86L84?tag=camprally-20" },
      ]
    },
  ],
};

export function getCustomSections(slug: string): CustomSection[] {
  return ARTICLE_CUSTOM_SECTIONS[slug] || [];
}
