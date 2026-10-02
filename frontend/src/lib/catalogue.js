// What "the things I sell" means changes completely with the business.
//
// A distributor sells stock: HSN, units, purchase price, barcodes, quantities.
// A restaurant sells dishes: a course, a price, veg or not, and whether it is
// on today. A homestay sells nights in a room and has no catalogue at all.
//
// One profile per business mode decides what the catalogue page is called and
// which parts of it exist, so nobody is asked for a UPC on a masala dosa.

export const CATALOGUE_PROFILES = {
  b2b: {
    key: "b2b",
    kind: "stock",
    title: "Products & Stock",
    subtitle: "What you sell — with GST rate and current stock.",
    itemWord: "product",
    addLabel: "Add Product",
    show: {
      sku: true, hsn: true, units: true, purchasePrice: true, stock: true,
      barcode: true, upc: true, modes: true, image: true,
      course: false, veg: false, description: false, availability: false,
    },
    defaults: { gst_rate: 18, unit: "NOS", category: "General" },
  },
  b2c: {
    key: "b2c",
    kind: "stock",
    title: "Products & Stock",
    subtitle: "What you sell — with GST rate and current stock.",
    itemWord: "product",
    addLabel: "Add Product",
    show: {
      sku: true, hsn: true, units: true, purchasePrice: true, stock: true,
      barcode: true, upc: true, modes: true, image: true,
      course: false, veg: false, description: false, availability: false,
    },
    defaults: { gst_rate: 18, unit: "NOS", category: "General" },
  },
  pos: {
    key: "pos",
    kind: "stock",
    title: "Products & Stock",
    subtitle: "Counter stock — scan a barcode at the till.",
    itemWord: "product",
    addLabel: "Add Product",
    show: {
      sku: true, hsn: true, units: true, purchasePrice: true, stock: true,
      barcode: true, upc: true, modes: true, image: true,
      course: false, veg: false, description: false, availability: false,
    },
    defaults: { gst_rate: 18, unit: "NOS", category: "General" },
  },
  restaurant: {
    key: "restaurant",
    kind: "menu",
    title: "Menu",
    subtitle: "What your guests can order. This is the menu they see on their phone.",
    itemWord: "dish",
    addLabel: "Add dish",
    show: {
      sku: false, hsn: false, units: false, purchasePrice: false, stock: false,
      barcode: false, upc: false, modes: false, image: true,
      course: true, veg: true, description: true, availability: true,
    },
    // Restaurant supply is a service at 5% with no input credit, under SAC 996331.
    defaults: { gst_rate: 5, unit: "NOS", hsn: "996331", category: "Main Course" },
  },
  stay: {
    key: "stay",
    kind: "none",
    title: "Rooms & rates",
    subtitle: "A stay sells nights, not stock.",
    itemWord: "room",
    emptyTitle: "There is no product list for a stay",
    emptyBody:
      "You sell nights in a room, so your rooms and their rates live in Stay & Bookings. " +
      "Extras a guest adds — breakfast, laundry, a late check-out — are charged straight " +
      "onto their booking.",
    emptyCta: { label: "Go to Stay & Bookings", to: "/stay" },
  },
};

export const COURSES = [
  "Starters", "Soups", "Salads", "Tiffin", "Main Course", "Biryani & Rice",
  "Breads", "Chinese", "Sides", "Desserts", "Beverages", "Others",
];

export function catalogueProfile(mode) {
  return CATALOGUE_PROFILES[mode] || CATALOGUE_PROFILES.b2b;
}
