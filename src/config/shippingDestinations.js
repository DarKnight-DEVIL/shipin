
/**
 * Easily toggle 'active' vs 'suspended' here.
 * Set 'isDefault: true' for countries you want listed on initial load.
 */
export const INDIA_HUB = {
  title: "India",
  subtitle: "Operations Hub",
  lat: 20.5937,
  lng: 78.9629,
};

export const ALL_LOCATIONS = [
  // --- DEFAULT DISPLAYED COUNTRIES (Initial 5) ---
  { title: "France", subtitle: "Europe", lat: 46.22, lng: 2.21, status: "active", isDefault: true, keywords: ["fr", "paris"] },
  { title: "Australia", subtitle: "Oceania", lat: -25.27, lng: 133.77, status: "active", isDefault: true, keywords: ["au", "sydney", "melbourne"] },
  { title: "United States", subtitle: "North America", lat: 37.09, lng: -95.71, status: "active", isDefault: true, keywords: ["usa", "us", "america", "new york", "california", "texas"] },
  { title: "Germany", subtitle: "Europe", lat: 51.16, lng: 10.45, status: "active", isDefault: true, keywords: ["de", "berlin", "frankfurt", "munich"] },
  { title: "United Kingdom", subtitle: "Europe", lat: 55.37, lng: -3.43, status: "active", isDefault: true, keywords: ["uk", "britain", "england", "london"] },

  // --- EXTENDED GLOBAL DESTINATIONS (Available via search) ---
  { title: "Afghanistan", subtitle: "Asia", lat: 33.93, lng: 67.71, status: "suspended", isDefault: false, keywords: ["af", "kabul"] },
  { title: "Argentina", subtitle: "South America", lat: -38.41, lng: -63.61, status: "active", isDefault: false, keywords: ["ar", "buenos aires"] },
  { title: "Austria", subtitle: "Europe", lat: 47.51, lng: 14.55, status: "active", isDefault: false, keywords: ["at", "vienna"] },
  { title: "Bahrain", subtitle: "Middle East", lat: 26.06, lng: 50.55, status: "active", isDefault: false, keywords: ["bh", "manama"] },
  { title: "Bangladesh", subtitle: "Asia", lat: 23.68, lng: 90.35, status: "active", isDefault: false, keywords: ["bd", "dhaka"] },
  { title: "Belarus", subtitle: "Europe", lat: 53.70, lng: 27.95, status: "suspended", isDefault: false, keywords: ["by", "minsk"] },
  { title: "Belgium", subtitle: "Europe", lat: 50.50, lng: 4.46, status: "active", isDefault: false, keywords: ["be", "brussels"] },
  { title: "Brazil", subtitle: "South America", lat: -14.23, lng: -51.92, status: "active", isDefault: false, keywords: ["br", "sao paulo", "rio"] },
  { title: "Canada", subtitle: "North America", lat: 56.13, lng: -106.34, status: "active", isDefault: false, keywords: ["ca", "toronto", "vancouver"] },
  { title: "China", subtitle: "Asia Pacific", lat: 35.86, lng: 104.19, status: "active", isDefault: false, keywords: ["cn", "beijing", "shanghai"] },
  { title: "Denmark", subtitle: "Europe", lat: 56.26, lng: 9.50, status: "active", isDefault: false, keywords: ["dk", "copenhagen"] },
  { title: "Egypt", subtitle: "Africa / Middle East", lat: 26.82, lng: 30.80, status: "active", isDefault: false, keywords: ["eg", "cairo"] },
  { title: "Finland", subtitle: "Europe", lat: 61.92, lng: 25.74, status: "active", isDefault: false, keywords: ["fi", "helsinki"] },
  { title: "Greece", subtitle: "Europe", lat: 39.07, lng: 21.82, status: "active", isDefault: false, keywords: ["gr", "athens"] },
  { title: "Hong Kong", subtitle: "Asia Pacific", lat: 22.31, lng: 114.16, status: "active", isDefault: false, keywords: ["hk"] },
  { title: "Indonesia", subtitle: "Southeast Asia", lat: -0.78, lng: 113.92, status: "active", isDefault: false, keywords: ["id", "jakarta"] },
  { title: "Ireland", subtitle: "Europe", lat: 53.14, lng: -7.69, status: "active", isDefault: false, keywords: ["ie", "dublin"] },
  { title: "Israel", subtitle: "Middle East", lat: 31.04, lng: 34.85, status: "active", isDefault: false, keywords: ["il", "tel aviv"] },
  { title: "Italy", subtitle: "Europe", lat: 41.87, lng: 12.56, status: "active", isDefault: false, keywords: ["it", "rome", "milan"] },
  { title: "Japan", subtitle: "Asia Pacific", lat: 36.20, lng: 138.25, status: "active", isDefault: false, keywords: ["jp", "tokyo", "osaka"] },
  { title: "Kenya", subtitle: "Africa", lat: -1.29, lng: 36.82, status: "active", isDefault: false, keywords: ["ke", "nairobi"] },
  { title: "Kuwait", subtitle: "Middle East", lat: 29.31, lng: 47.48, status: "active", isDefault: false, keywords: ["kw"] },
  { title: "Malaysia", subtitle: "Southeast Asia", lat: 4.21, lng: 101.97, status: "active", isDefault: false, keywords: ["my", "kuala lumpur"] },
  { title: "Mexico", subtitle: "North America", lat: 23.63, lng: -102.55, status: "active", isDefault: false, keywords: ["mx", "mexico city"] },
  { title: "Netherlands", subtitle: "Europe", lat: 52.13, lng: 5.29, status: "active", isDefault: false, keywords: ["nl", "amsterdam"] },
  { title: "New Zealand", subtitle: "Oceania", lat: -40.90, lng: 174.88, status: "active", isDefault: false, keywords: ["nz", "auckland"] },
  { title: "Nigeria", subtitle: "Africa", lat: 9.08, lng: 8.67, status: "active", isDefault: false, keywords: ["ng", "lagos"] },
  { title: "Norway", subtitle: "Europe", lat: 60.47, lng: 8.46, status: "active", isDefault: false, keywords: ["no", "oslo"] },
  { title: "Oman", subtitle: "Middle East", lat: 21.47, lng: 57.01, status: "active", isDefault: false, keywords: ["om", "muscat"] },
  { title: "Philippines", subtitle: "Southeast Asia", lat: 12.87, lng: 121.77, status: "active", isDefault: false, keywords: ["ph", "manila"] },
  { title: "Poland", subtitle: "Europe", lat: 51.91, lng: 19.14, status: "active", isDefault: false, keywords: ["pl", "warsaw"] },
  { title: "Portugal", subtitle: "Europe", lat: 39.39, lng: -8.22, status: "active", isDefault: false, keywords: ["pt", "lisbon"] },
  { title: "Qatar", subtitle: "Middle East", lat: 25.35, lng: 51.18, status: "active", isDefault: false, keywords: ["qa", "doha"] },
  { title: "Russia", subtitle: "Eurasia", lat: 61.52, lng: 105.31, status: "suspended", isDefault: false, keywords: ["ru", "moscow"] },
  { title: "Saudi Arabia", subtitle: "Middle East", lat: 23.88, lng: 45.07, status: "active", isDefault: false, keywords: ["sa", "riyadh"] },
  { title: "Singapore", subtitle: "Southeast Asia", lat: 1.35, lng: 103.81, status: "active", isDefault: false, keywords: ["sg"] },
  { title: "South Africa", subtitle: "Africa", lat: -30.55, lng: 22.93, status: "active", isDefault: false, keywords: ["za", "johannesburg"] },
  { title: "South Korea", subtitle: "Asia Pacific", lat: 35.90, lng: 127.76, status: "active", isDefault: false, keywords: ["kr", "seoul"] },
  { title: "Spain", subtitle: "Europe", lat: 40.46, lng: -3.74, status: "active", isDefault: false, keywords: ["es", "madrid", "barcelona"] },
  { title: "Sweden", subtitle: "Europe", lat: 60.12, lng: 18.64, status: "active", isDefault: false, keywords: ["se", "stockholm"] },
  { title: "Switzerland", subtitle: "Europe", lat: 46.81, lng: 8.22, status: "active", isDefault: false, keywords: ["ch", "zurich"] },
  { title: "Thailand", subtitle: "Southeast Asia", lat: 15.87, lng: 100.99, status: "active", isDefault: false, keywords: ["th", "bangkok"] },
  { title: "Turkey", subtitle: "Eurasia", lat: 38.96, lng: 35.24, status: "active", isDefault: false, keywords: ["tr", "istanbul"] },
  { title: "United Arab Emirates", subtitle: "Middle East", lat: 23.42, lng: 53.84, status: "active", isDefault: false, keywords: ["uae", "dubai", "abu dhabi"] },
  { title: "Vietnam", subtitle: "Southeast Asia", lat: 14.05, lng: 108.27, status: "active", isDefault: false, keywords: ["vn", "hanoi"] }
];