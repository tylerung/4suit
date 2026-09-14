import type {
  Comment, MediaItem, Post, Rating, Subscores, User, Venue, VenueList,
} from '../types'

/* ------------------------------------------------------------------
 * Deterministic PRNG so every visitor sees the same demo dataset.
 * ------------------------------------------------------------------ */

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rnd = mulberry32(0x5ea7ed)
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]
const range = (lo: number, hi: number) => lo + rnd() * (hi - lo)
const int = (lo: number, hi: number) => Math.floor(range(lo, hi + 1))

/** Fixed clock so `createdAt` values are stable across reloads. */
const NOW = Date.parse('2026-09-09T18:00:00Z')
const HOUR = 3600_000
const DAY = 24 * HOUR
const ago = (hours: number) => new Date(NOW - hours * HOUR).toISOString()

/* ------------------------------------------------------------------ venues */

type VenueSeed = Omit<Venue, 'id'> & { id: string }

export const VENUES: Venue[] = ([
  // ---- Las Vegas ----
  { id: 'v-bellagio', name: 'Bellagio Poker Room', type: 'casino', address: '3600 S Las Vegas Blvd', city: 'Las Vegas', state: 'NV', lat: 36.1126, lng: -115.1767, tableCount: 40, games: ['nlhe', 'plo', 'mixed', 'limit-holdem'], stakes: ['$1/$3 NLHE', '$2/$5 NLHE', '$5/$10 NLHE', '$10/$20 Mixed', '$400/$800 Bobby’s Room'], rake: '10% to $4 + $1 BBJ', amenities: ['high-limit', 'food-service', 'comps', 'open-24h', 'valet', 'hotel'], hours: 'Open 24 hours', website: 'bellagio.mgmresorts.com', blurb: 'The room that made the Strip famous. Bobby’s Room in the back, tourists out front, and the highest concentration of big bet mixed games in America.' },
  { id: 'v-aria', name: 'ARIA Poker Room', type: 'casino', address: '3730 S Las Vegas Blvd', city: 'Las Vegas', state: 'NV', lat: 36.1073, lng: -115.1765, tableCount: 24, games: ['nlhe', 'plo', 'plo5', 'mixed', 'tournaments'], stakes: ['$1/$3 NLHE', '$2/$5 NLHE', '$5/$10 PLO', '$25/$50 NLHE'], rake: '10% to $5', amenities: ['high-limit', 'food-service', 'comps', 'open-24h', 'waitlist-app', 'massage', 'hotel'], hours: 'Open 24 hours', website: 'aria.mgmresorts.com', blurb: 'The default answer to “where should I play in Vegas.” Deep $2/$5, a legit high stakes section, and daily tournaments that actually fill.' },
  { id: 'v-wynn', name: 'Wynn Poker Room', type: 'casino', address: '3131 S Las Vegas Blvd', city: 'Las Vegas', state: 'NV', lat: 36.1265, lng: -115.1656, tableCount: 27, games: ['nlhe', 'plo', 'tournaments'], stakes: ['$1/$3 NLHE', '$2/$5 NLHE', '$5/$10 NLHE', '$5/$10 PLO'], rake: '10% to $4', amenities: ['high-limit', 'food-service', 'comps', 'open-24h', 'valet', 'massage', 'hotel'], hours: 'Open 24 hours', website: 'wynnlasvegas.com', blurb: 'Quietly the best-run room on the Strip. Big daily tournament series, immaculate floor staff, and a $2/$5 that plays deeper than it should.' },
  { id: 'v-resorts-world', name: 'Resorts World Poker Room', type: 'casino', address: '3000 S Las Vegas Blvd', city: 'Las Vegas', state: 'NV', lat: 36.1364, lng: -115.1650, tableCount: 12, games: ['nlhe', 'plo', 'tournaments'], stakes: ['$1/$3 NLHE', '$2/$5 NLHE', '$5/$5 PLO'], rake: '10% to $5', amenities: ['food-service', 'comps', 'open-24h', 'waitlist-app', 'sportsbook', 'hotel'], hours: 'Open 24 hours', website: 'rwlasvegas.com', blurb: 'Newest room on the north Strip. Small but bright, and the game selection swings hard with whoever is in town.' },
  { id: 'v-venetian', name: 'The Venetian Poker Room', type: 'casino', address: '3355 S Las Vegas Blvd', city: 'Las Vegas', state: 'NV', lat: 36.1212, lng: -115.1697, tableCount: 59, games: ['nlhe', 'plo', 'limit-holdem', 'tournaments'], stakes: ['$1/$2 NLHE', '$1/$3 NLHE', '$2/$5 NLHE', '$4/$8 Limit'], rake: '10% to $4 + $1', amenities: ['food-service', 'comps', 'open-24h', 'waitlist-app', 'massage', 'sportsbook', 'hotel'], hours: 'Open 24 hours', website: 'venetianlasvegas.com', blurb: 'The biggest room in Nevada. Deepstack series all year, a game running at every hour, and the widest tourist pool on the Strip.' },
  { id: 'v-horseshoe-lv', name: 'Horseshoe Las Vegas', type: 'casino', address: '3645 S Las Vegas Blvd', city: 'Las Vegas', state: 'NV', lat: 36.1162, lng: -115.1745, tableCount: 10, games: ['nlhe', 'tournaments'], stakes: ['$1/$2 NLHE', '$1/$3 NLHE'], rake: '10% to $5', amenities: ['comps', 'open-24h', 'hotel'], hours: 'Open 24 hours', website: 'caesars.com/horseshoe-las-vegas', blurb: 'Center-Strip, cheap buy-ins, and a nightly $1/$2 full of people who just left the craps table.' },
  { id: 'v-south-point', name: 'South Point Poker Room', type: 'casino', address: '9777 S Las Vegas Blvd', city: 'Las Vegas', state: 'NV', lat: 36.0121, lng: -115.1729, tableCount: 22, games: ['nlhe', 'plo', 'limit-holdem', 'stud', 'tournaments'], stakes: ['$1/$2 NLHE', '$2/$5 NLHE', '$4/$8 Limit', '$1/$2 PLO'], rake: '10% to $4', amenities: ['food-service', 'comps', 'free-parking', 'open-24h', 'bad-beat-jackpot', 'hotel'], hours: 'Open 24 hours', website: 'southpointcasino.com', blurb: 'Locals room done right. Free parking, real comps, and a $4/$8 limit game that has been running since the Bush administration.' },
  { id: 'v-red-rock', name: 'Red Rock Poker Room', type: 'casino', address: '11011 W Charleston Blvd', city: 'Las Vegas', state: 'NV', lat: 36.1580, lng: -115.3363, tableCount: 20, games: ['nlhe', 'plo', 'mixed', 'tournaments'], stakes: ['$1/$2 NLHE', '$2/$5 NLHE', '$2/$5 PLO'], rake: '10% to $4', amenities: ['food-service', 'comps', 'free-parking', 'open-24h', 'bad-beat-jackpot', 'hotel'], hours: 'Open 24 hours', website: 'redrock.sclv.com', blurb: 'The nicest locals room in the valley. Summit Club promos, a soft weekend $2/$5, and parking you do not have to pay for.' },
  { id: 'v-orleans', name: 'Orleans Poker Room', type: 'casino', address: '4500 W Tropicana Ave', city: 'Las Vegas', state: 'NV', lat: 36.1004, lng: -115.2072, tableCount: 35, games: ['nlhe', 'limit-holdem', 'stud', 'plo', 'tournaments'], stakes: ['$1/$2 NLHE', '$2/$5 NLHE', '$2/$4 Limit', '$4/$8 Omaha H/L'], rake: '10% to $4', amenities: ['comps', 'free-parking', 'open-24h', 'bad-beat-jackpot', 'hotel'], hours: 'Open 24 hours', website: 'orleanscasino.com', blurb: 'Where the old-school Vegas limit players never left. Big morning tournaments and the friendliest $4/$8 in town.' },

  // ---- Los Angeles / SoCal ----
  { id: 'v-commerce', name: 'Commerce Casino', type: 'cardroom', address: '6131 Telegraph Rd', city: 'Commerce', state: 'CA', lat: 33.9922, lng: -118.1573, tableCount: 200, games: ['nlhe', 'plo', 'limit-holdem', 'stud', 'mixed', 'tournaments'], stakes: ['$1/$3 NLHE', '$2/$3 NLHE', '$5/$5 NLHE', '$20/$40 Limit', '$40/$80 Limit'], rake: 'Time collection, $7-$14/half hour', amenities: ['food-service', 'high-limit', 'open-24h', 'free-parking', 'waitlist-app', 'massage', 'valet'], hours: 'Open 24 hours', website: 'commercecasino.com', blurb: 'The largest card room on earth. Two hundred tables, every limit game that still exists, and a $40/$80 that has run continuously for decades.' },
  { id: 'v-bike', name: 'The Bicycle Hotel & Casino', type: 'cardroom', address: '888 Bicycle Casino Dr', city: 'Bell Gardens', state: 'CA', lat: 33.9600, lng: -118.1500, tableCount: 185, games: ['nlhe', 'plo', 'limit-holdem', 'mixed', 'tournaments'], stakes: ['$1/$3 NLHE', '$2/$5 NLHE', '$5/$10 PLO', '$10/$20 NLHE'], rake: 'Time collection, $6-$12/half hour', amenities: ['food-service', 'high-limit', 'open-24h', 'free-parking', 'waitlist-app', 'hotel', 'valet'], hours: 'Open 24 hours', website: 'thebike.com', blurb: 'Home of the biggest televised cash games in LA. The high limit section runs deep and the tournament series draws the whole West Coast.' },
  { id: 'v-hustler', name: 'Hustler Casino', type: 'cardroom', address: '1000 W Redondo Beach Blvd', city: 'Gardena', state: 'CA', lat: 33.8894, lng: -118.3040, tableCount: 45, games: ['nlhe', 'plo', 'plo5', 'mixed'], stakes: ['$2/$3 NLHE', '$5/$5 NLHE', '$5/$5 PLO', '$25/$50 NLHE'], rake: 'Time collection, $8-$15/half hour', amenities: ['food-service', 'high-limit', 'open-24h', 'free-parking', 'valet'], hours: 'Open 24 hours', website: 'hustlercasinola.com', blurb: 'Small room, enormous games. Hustler Casino Live turned the back tables into the most watched cash game on the internet.' },
  { id: 'v-hollywood-park', name: 'Hollywood Park Casino', type: 'cardroom', address: '3883 W Century Blvd', city: 'Inglewood', state: 'CA', lat: 33.9460, lng: -118.3390, tableCount: 60, games: ['nlhe', 'plo', 'limit-holdem', 'tournaments'], stakes: ['$1/$2 NLHE', '$2/$3 NLHE', '$3/$5 NLHE'], rake: 'Time collection, $6-$10/half hour', amenities: ['food-service', 'open-24h', 'free-parking', 'waitlist-app'], hours: 'Open 24 hours', website: 'playhpc.com', blurb: 'Right next to SoFi. Softest weekday $1/$2 in the county and a rebuilt room that finally feels modern.' },
  { id: 'v-hawaiian-gardens', name: 'The Gardens Casino', type: 'cardroom', address: '11871 E Carson St', city: 'Hawaiian Gardens', state: 'CA', lat: 33.8300, lng: -118.0730, tableCount: 220, games: ['nlhe', 'plo', 'limit-holdem', 'stud', 'tournaments'], stakes: ['$1/$3 NLHE', '$2/$5 NLHE', '$4/$8 Limit'], rake: 'Time collection, $6-$12/half hour', amenities: ['food-service', 'open-24h', 'free-parking', 'waitlist-app', 'massage'], hours: 'Open 24 hours', website: 'thegardenscasino.com', blurb: 'A giant, spotless room in a strip-mall neighborhood. Enormous Sunday tournaments and a jackpot that has made a few people’s year.' },

  // ---- Atlantic City / Northeast ----
  { id: 'v-borgata', name: 'Borgata Poker Room', type: 'casino', address: '1 Borgata Way', city: 'Atlantic City', state: 'NJ', lat: 39.3789, lng: -74.4297, tableCount: 34, games: ['nlhe', 'plo', 'limit-holdem', 'mixed', 'tournaments'], stakes: ['$1/$2 NLHE', '$2/$5 NLHE', '$5/$10 PLO'], rake: '10% to $4 + $1', amenities: ['food-service', 'comps', 'high-limit', 'open-24h', 'waitlist-app', 'hotel', 'valet'], hours: 'Open 24 hours', website: 'theborgata.com', blurb: 'The East Coast’s flagship. Borgata Poker Open and WPT stops keep it packed, and the $2/$5 runs every single night.' },
  { id: 'v-ocean-ac', name: 'Ocean Casino Resort Poker', type: 'casino', address: '500 Boardwalk', city: 'Atlantic City', state: 'NJ', lat: 39.3820, lng: -74.4180, tableCount: 14, games: ['nlhe', 'plo', 'tournaments'], stakes: ['$1/$2 NLHE', '$1/$3 NLHE', '$2/$5 NLHE'], rake: '10% to $5', amenities: ['comps', 'food-service', 'open-24h', 'hotel', 'sportsbook'], hours: 'Open 24 hours', website: 'theoceanac.com', blurb: 'Ocean-view tables on the Boardwalk end. Smaller list than Borgata but the overflow lands here on weekends.' },
  { id: 'v-parx', name: 'Parx Casino Poker Room', type: 'casino', address: '2999 Street Rd', city: 'Bensalem', state: 'PA', lat: 40.1200, lng: -74.9430, tableCount: 60, games: ['nlhe', 'plo', 'limit-holdem', 'tournaments'], stakes: ['$1/$2 NLHE', '$1/$3 NLHE', '$2/$5 NLHE', '$5/$10 PLO'], rake: '10% to $4 + $1', amenities: ['food-service', 'comps', 'open-24h', 'free-parking', 'waitlist-app', 'sportsbook'], hours: 'Open 24 hours', website: 'parxcasino.com', blurb: 'Busiest room in Pennsylvania. Big Stax series draws the whole corridor and there is always a list at 3am.' },
  { id: 'v-rivers-philly', name: 'Rivers Casino Philadelphia', type: 'casino', address: '1001 N Delaware Ave', city: 'Philadelphia', state: 'PA', lat: 39.9640, lng: -75.1360, tableCount: 28, games: ['nlhe', 'plo', 'tournaments'], stakes: ['$1/$2 NLHE', '$1/$3 NLHE', '$2/$5 NLHE'], rake: '10% to $4', amenities: ['food-service', 'comps', 'open-24h', 'free-parking', 'sportsbook'], hours: 'Open 24 hours', website: 'riverscasino.com/philadelphia', blurb: 'City-side alternative to Parx. Free garage, a loose late-night $1/$3, and no bridge traffic.' },
  { id: 'v-wind-creek', name: 'Wind Creek Bethlehem', type: 'casino', address: '77 Wind Creek Blvd', city: 'Bethlehem', state: 'PA', lat: 40.6140, lng: -75.3520, tableCount: 30, games: ['nlhe', 'plo', 'limit-holdem', 'tournaments'], stakes: ['$1/$2 NLHE', '$2/$5 NLHE', '$1/$2 PLO'], rake: '10% to $4', amenities: ['food-service', 'comps', 'free-parking', 'hotel', 'bad-beat-jackpot'], hours: 'Open 24 hours', website: 'windcreekbethlehem.com', blurb: 'Built inside the old Bethlehem Steel works. Great structure on the Sunday tournament and a jackpot that keeps climbing.' },
  { id: 'v-encore-boston', name: 'Encore Boston Harbor', type: 'casino', address: '1 Broadway', city: 'Everett', state: 'MA', lat: 42.3920, lng: -71.0700, tableCount: 24, games: ['nlhe', 'plo', 'mixed', 'tournaments'], stakes: ['$1/$3 NLHE', '$2/$5 NLHE', '$5/$10 NLHE'], rake: '10% to $6', amenities: ['food-service', 'comps', 'high-limit', 'open-24h', 'valet', 'hotel'], hours: 'Open 24 hours', website: 'encorebostonharbor.com', blurb: 'The only real room in New England, and it plays like it. Deep $2/$5 every night and a high stakes game most weekends.' },
  { id: 'v-maryland-live', name: 'Live! Casino Maryland', type: 'casino', address: '7002 Arundel Mills Cir', city: 'Hanover', state: 'MD', lat: 39.1600, lng: -76.7200, tableCount: 52, games: ['nlhe', 'plo', 'limit-holdem', 'tournaments'], stakes: ['$1/$2 NLHE', '$2/$5 NLHE', '$5/$10 PLO'], rake: '10% to $5', amenities: ['food-service', 'comps', 'open-24h', 'free-parking', 'hotel', 'sportsbook'], hours: 'Open 24 hours', website: 'marylandlivecasino.com', blurb: 'Mid-Atlantic anchor between DC and Baltimore. Big room, fast lists, and a PLO game that gets out of hand.' },

  // ---- South Florida ----
  { id: 'v-seminole-hr', name: 'Seminole Hard Rock Hollywood', type: 'casino', address: '1 Seminole Way', city: 'Hollywood', state: 'FL', lat: 26.0500, lng: -80.2100, tableCount: 45, games: ['nlhe', 'plo', 'plo5', 'mixed', 'tournaments'], stakes: ['$1/$3 NLHE', '$2/$5 NLHE', '$5/$10 PLO', '$25/$50 NLHE'], rake: '10% to $5', amenities: ['food-service', 'comps', 'high-limit', 'open-24h', 'valet', 'hotel', 'massage'], hours: 'Open 24 hours', website: 'seminolehardrockhollywood.com', blurb: 'The guitar hotel room. Lucky Hearts Poker Open in January, monster PLO all winter, and the deepest games in the Southeast.' },
  { id: 'v-pompano', name: 'Harrah’s Pompano Beach Poker', type: 'casino', address: '1800 SW 3rd St', city: 'Pompano Beach', state: 'FL', lat: 26.2340, lng: -80.1300, tableCount: 20, games: ['nlhe', 'plo', 'tournaments'], stakes: ['$1/$2 NLHE', '$1/$3 NLHE', '$2/$5 PLO'], rake: '10% to $5', amenities: ['comps', 'food-service', 'free-parking', 'open-24h'], hours: 'Open 24 hours', website: 'caesars.com', blurb: 'Quiet Broward alternative. Older crowd, straightforward $1/$3, and you will never wait long for a seat.' },
  { id: 'v-pbkc', name: 'Palm Beach Kennel Club', type: 'cardroom', address: '1111 N Congress Ave', city: 'West Palm Beach', state: 'FL', lat: 26.6870, lng: -80.0850, tableCount: 40, games: ['nlhe', 'plo', 'limit-holdem', 'tournaments'], stakes: ['$1/$2 NLHE', '$2/$5 NLHE', '$5/$5 PLO'], rake: '10% to $4', amenities: ['food-service', 'free-parking', 'open-24h', 'bad-beat-jackpot'], hours: 'Open 24 hours', website: 'pbkennelclub.com', blurb: 'Palm Beach County’s poker home. Snowbird season turns the $1/$2 into a charity, and the jackpot drop is worth the seat.' },

  // ---- Texas member clubs ----
  { id: 'v-tch-dallas', name: 'Texas Card House Dallas', type: 'cardroom', address: '2545 Manana Dr', city: 'Dallas', state: 'TX', lat: 32.8140, lng: -96.7900, tableCount: 30, games: ['nlhe', 'plo', 'plo5', 'mixed', 'tournaments'], stakes: ['$1/$2 NLHE', '$2/$5 NLHE', '$5/$5 PLO'], rake: 'Membership + seat time, no rake', amenities: ['food-service', 'free-parking', 'open-24h', 'waitlist-app'], hours: 'Open 24 hours', website: 'texascardhouse.com', blurb: 'Membership club model — you pay for the chair, not the pot. The no-rake structure makes it the best value in the state.' },
  { id: 'v-the-lodge', name: 'The Lodge Card Club', type: 'cardroom', address: '2600 Sam Bass Rd', city: 'Round Rock', state: 'TX', lat: 30.5083, lng: -97.6789, tableCount: 40, games: ['nlhe', 'plo', 'plo5', 'mixed', 'tournaments', 'bomb-pots'], stakes: ['$1/$3 NLHE', '$2/$5 NLHE', '$5/$10 PLO', '$25/$50 NLHE'], rake: 'Membership + seat time, no rake', amenities: ['food-service', 'free-parking', 'high-limit', 'open-24h', 'waitlist-app'], hours: 'Open 24 hours', website: 'thelodgecardclub.com', blurb: 'Doug Polk’s club outside Austin. Streamed feature table, bomb pots on the hour, and the biggest games in Texas.' },
  { id: 'v-champions-social', name: 'Champions Social', type: 'cardroom', address: '8555 Katy Fwy', city: 'Houston', state: 'TX', lat: 29.9000, lng: -95.5600, tableCount: 25, games: ['nlhe', 'plo', 'tournaments', 'bomb-pots'], stakes: ['$1/$3 NLHE', '$2/$5 NLHE', '$5/$5 PLO'], rake: 'Membership + seat time, no rake', amenities: ['food-service', 'free-parking', 'open-24h'], hours: 'Open 24 hours', website: 'championssocial.com', blurb: 'Houston’s busiest club. Oil money on the weekends and a PLO game that goes until the sun comes up.' },

  // ---- Midwest ----
  { id: 'v-rivers-des-plaines', name: 'Rivers Casino Des Plaines', type: 'casino', address: '3000 S River Rd', city: 'Des Plaines', state: 'IL', lat: 42.0180, lng: -87.8890, tableCount: 20, games: ['nlhe', 'plo', 'tournaments'], stakes: ['$1/$2 NLHE', '$2/$5 NLHE', '$5/$10 NLHE'], rake: '10% to $5', amenities: ['food-service', 'comps', 'valet', 'open-24h', 'sportsbook'], hours: 'Open 24 hours', website: 'riverscasino.com/desplaines', blurb: 'Chicagoland’s big game. The $5/$10 is the largest regular NLHE in the region and the list moves fast on Fridays.' },
  { id: 'v-horseshoe-hammond', name: 'Horseshoe Hammond', type: 'casino', address: '777 Casino Center Dr', city: 'Hammond', state: 'IN', lat: 41.6890, lng: -87.5030, tableCount: 34, games: ['nlhe', 'plo', 'limit-holdem', 'tournaments'], stakes: ['$1/$2 NLHE', '$2/$5 NLHE', '$1/$2 PLO'], rake: '10% to $4 + $1', amenities: ['food-service', 'comps', 'free-parking', 'open-24h', 'bad-beat-jackpot'], hours: 'Open 24 hours', website: 'caesars.com/horseshoe-hammond', blurb: 'Twenty minutes from the Loop and open all night. Circuit stops in the fall bring the whole Midwest through.' },

  // ---- West / other ----
  { id: 'v-thunder-valley', name: 'Thunder Valley Casino', type: 'casino', address: '1200 Athens Ave', city: 'Lincoln', state: 'CA', lat: 38.8930, lng: -121.2860, tableCount: 18, games: ['nlhe', 'plo', 'tournaments'], stakes: ['$1/$3 NLHE', '$2/$5 NLHE', '$1/$2 PLO'], rake: '10% to $5', amenities: ['food-service', 'comps', 'free-parking', 'hotel', 'open-24h'], hours: 'Open 24 hours', website: 'thundervalleyresort.com', blurb: 'Sacramento’s room. WPT stop in the spring, and a $2/$5 that plays far bigger than the blinds suggest.' },
  { id: 'v-muckleshoot', name: 'Muckleshoot Casino', type: 'casino', address: '2402 Auburn Way S', city: 'Auburn', state: 'WA', lat: 47.3060, lng: -122.1980, tableCount: 22, games: ['nlhe', 'plo', 'limit-holdem', 'tournaments'], stakes: ['$2/$5 NLHE', '$4/$8 Limit', '$5/$5 PLO'], rake: '10% to $6', amenities: ['food-service', 'free-parking', 'open-24h', 'bad-beat-jackpot'], hours: 'Open 24 hours', website: 'muckleshootcasino.com', blurb: 'The Seattle area’s main room. Washington caps buy-ins at $500, which makes the $2/$5 play like nowhere else.' },
  { id: 'v-winstar', name: 'WinStar World Casino', type: 'casino', address: '777 Casino Ave', city: 'Thackerville', state: 'OK', lat: 33.7600, lng: -97.1400, tableCount: 46, games: ['nlhe', 'plo', 'limit-holdem', 'tournaments'], stakes: ['$1/$2 NLHE', '$2/$5 NLHE', '$5/$10 PLO'], rake: '10% to $5', amenities: ['food-service', 'comps', 'free-parking', 'open-24h', 'hotel'], hours: 'Open 24 hours', website: 'winstar.com', blurb: 'An hour north of Dallas and the size of a small airport. The room fills with Texans every weekend.' },
  { id: 'v-talking-stick', name: 'Talking Stick Resort', type: 'casino', address: '9800 E Talking Stick Way', city: 'Scottsdale', state: 'AZ', lat: 33.5390, lng: -111.8890, tableCount: 47, games: ['nlhe', 'plo', 'limit-holdem', 'mixed', 'tournaments'], stakes: ['$1/$2 NLHE', '$2/$5 NLHE', '$3/$6 Limit', '$5/$5 PLO'], rake: '10% to $4', amenities: ['food-service', 'comps', 'free-parking', 'open-24h', 'hotel', 'bad-beat-jackpot'], hours: 'Open 24 hours', website: 'talkingstickresort.com', blurb: 'Arizona’s biggest room. Spring training turns March into the softest month of the year.' },
  { id: 'v-choctaw', name: 'Choctaw Casino Durant', type: 'casino', address: '4216 S Hwy 69/75', city: 'Durant', state: 'OK', lat: 33.9950, lng: -96.3500, tableCount: 32, games: ['nlhe', 'plo', 'tournaments'], stakes: ['$1/$3 NLHE', '$2/$5 NLHE', '$5/$10 PLO'], rake: '10% to $5', amenities: ['food-service', 'comps', 'free-parking', 'open-24h', 'hotel'], hours: 'Open 24 hours', website: 'choctawcasinos.com', blurb: 'WSOP Circuit anchor for the region. Series weeks turn the whole property into a poker town.' },
] as VenueSeed[]).map((v) => ({ ...v }))

/* ------------------------------------------------------------------- users */

type UserSeed = Pick<User, 'id' | 'username' | 'displayName' | 'bio' | 'avatarTone' | 'roles' | 'homeVenueId' | 'location' | 'isPrivate' | 'verified'> & { joinedDaysAgo: number }

const USER_SEEDS: UserSeed[] = [
  { id: 'u-you', username: 'railbirder', displayName: 'You', bio: 'New here. Grinding $1/$3 and taking notes on every room I sit in.', avatarTone: 'blue', roles: ['recreational', 'cash-player'], homeVenueId: 'v-aria', location: 'Las Vegas, NV', isPrivate: false, verified: false, joinedDaysAgo: 12 },
  { id: 'u-marisol', username: 'marisolplays', displayName: 'Marisol Vega', bio: 'Full-time $2/$5 and $5/$10 in Vegas. Nine years on the Strip. I will tell you exactly which room is lying about its rake.', avatarTone: 'mist', roles: ['pro', 'cash-player'], homeVenueId: 'v-wynn', location: 'Las Vegas, NV', isPrivate: false, verified: true, joinedDaysAgo: 640 },
  { id: 'u-dez', username: 'dezdeals', displayName: 'Dez Okafor', bio: 'Dealer at Commerce for 11 years. Yes I have seen it. No, I will not tell you who.', avatarTone: 'slate', roles: ['dealer', 'cash-player'], homeVenueId: 'v-commerce', location: 'Commerce, CA', isPrivate: false, verified: true, joinedDaysAgo: 520 },
  { id: 'u-priya', username: 'priyapocket', displayName: 'Priya Raman', bio: 'Tournament grinder. 2 circuit rings, 0 chill. Structures are the whole game and most rooms get them wrong.', avatarTone: 'night', roles: ['tournament-player', 'pro'], homeVenueId: 'v-borgata', location: 'Atlantic City, NJ', isPrivate: false, verified: true, joinedDaysAgo: 700 },
  { id: 'u-hank', username: 'limithank', displayName: 'Hank Delacroix', bio: '$4/$8 limit, mornings only, same seat since 2009. Ask me about comps.', avatarTone: 'blue', roles: ['recreational', 'cash-player'], homeVenueId: 'v-orleans', location: 'Las Vegas, NV', isPrivate: false, verified: false, joinedDaysAgo: 410 },
  { id: 'u-june', username: 'junevlogs', displayName: 'June Tanaka', bio: 'Poker vlog, 3 uploads a week. Room reviews with actual numbers. Currently on a 40-room US tour.', avatarTone: 'mist', roles: ['vlogger', 'streamer', 'recreational'], homeVenueId: 'v-the-lodge', location: 'Austin, TX', isPrivate: false, verified: true, joinedDaysAgo: 380 },
  { id: 'u-omar', username: 'omarfloor', displayName: 'Omar Haddad', bio: 'Floor supervisor. I read every one of these reviews and pass them up. Be specific and I will fix it.', avatarTone: 'slate', roles: ['floor-supervisor', 'tournament-director'], homeVenueId: 'v-parx', location: 'Bensalem, PA', isPrivate: false, verified: true, joinedDaysAgo: 300 },
  { id: 'u-cassie', username: 'cassiePLO', displayName: 'Cassie Nowak', bio: 'PLO only. If your room does not spread $5/$5 pot limit I do not know what to tell you.', avatarTone: 'night', roles: ['cash-player', 'pro'], homeVenueId: 'v-seminole-hr', location: 'Hollywood, FL', isPrivate: false, verified: false, joinedDaysAgo: 260 },
  { id: 'u-teddy', username: 'teddystakes', displayName: 'Teddy Brennan', bio: 'I stake mid-stakes tournament players. DM with a spreadsheet, not a story.', avatarTone: 'blue', roles: ['staker', 'tournament-player'], homeVenueId: 'v-maryland-live', location: 'Hanover, MD', isPrivate: true, verified: false, joinedDaysAgo: 220 },
  { id: 'u-nina', username: 'ninareports', displayName: 'Nina Alvarez', bio: 'Live reporting from circuit stops. Chip counts, structures, and the bad beats nobody asked for.', avatarTone: 'mist', roles: ['reporter'], homeVenueId: 'v-choctaw', location: 'Dallas, TX', isPrivate: false, verified: true, joinedDaysAgo: 190 },
  { id: 'u-grant', username: 'grantcoach', displayName: 'Grant Whitfield', bio: 'Coach. Solver work for live $2/$5 and up. Room quality matters more than your range charts.', avatarTone: 'slate', roles: ['coach', 'pro'], homeVenueId: 'v-bellagio', location: 'Las Vegas, NV', isPrivate: false, verified: false, joinedDaysAgo: 165 },
  { id: 'u-luz', username: 'luzhomegame', displayName: 'Luz Ferreira', bio: 'Host the best home game in Bell Gardens. When it breaks we go to the Bike.', avatarTone: 'night', roles: ['home-game-host', 'recreational'], homeVenueId: 'v-bike', location: 'Bell Gardens, CA', isPrivate: true, verified: false, joinedDaysAgo: 140 },
  { id: 'u-milo', username: 'milomidstakes', displayName: 'Milo Castellanos', bio: 'Weekend warrior chasing soft $1/$3. Rating every room I visit, no exceptions.', avatarTone: 'blue', roles: ['recreational', 'cash-player'], homeVenueId: 'v-rivers-des-plaines', location: 'Chicago, IL', isPrivate: false, verified: false, joinedDaysAgo: 110 },
  { id: 'u-sable', username: 'sablestream', displayName: 'Sable Whitmore', bio: 'Streaming $1/$3 four nights a week. The room’s wifi is part of the review.', avatarTone: 'mist', roles: ['streamer', 'cash-player'], homeVenueId: 'v-hustler', location: 'Gardena, CA', isPrivate: false, verified: false, joinedDaysAgo: 75 },
]

/** Directed follow graph: [follower, followee]. */
const FOLLOWS: [string, string][] = [
  ['u-you', 'u-marisol'], ['u-you', 'u-june'], ['u-you', 'u-dez'], ['u-you', 'u-priya'],
  ['u-you', 'u-cassie'], ['u-you', 'u-milo'], ['u-you', 'u-grant'], ['u-you', 'u-nina'],
  ['u-marisol', 'u-grant'], ['u-marisol', 'u-june'], ['u-marisol', 'u-you'], ['u-marisol', 'u-priya'],
  ['u-dez', 'u-luz'], ['u-dez', 'u-sable'], ['u-dez', 'u-marisol'], ['u-dez', 'u-you'],
  ['u-priya', 'u-nina'], ['u-priya', 'u-omar'], ['u-priya', 'u-teddy'], ['u-priya', 'u-marisol'],
  ['u-hank', 'u-marisol'], ['u-hank', 'u-june'],
  ['u-june', 'u-cassie'], ['u-june', 'u-sable'], ['u-june', 'u-you'], ['u-june', 'u-milo'],
  ['u-omar', 'u-priya'], ['u-omar', 'u-nina'],
  ['u-cassie', 'u-june'], ['u-cassie', 'u-marisol'],
  ['u-teddy', 'u-priya'], ['u-teddy', 'u-nina'],
  ['u-nina', 'u-priya'], ['u-nina', 'u-omar'], ['u-nina', 'u-june'],
  ['u-grant', 'u-marisol'], ['u-grant', 'u-you'],
  ['u-luz', 'u-dez'], ['u-luz', 'u-sable'],
  ['u-milo', 'u-june'], ['u-milo', 'u-marisol'], ['u-milo', 'u-you'],
  ['u-sable', 'u-june'], ['u-sable', 'u-dez'], ['u-sable', 'u-cassie'],
]

/** Follow requests waiting on a private account's approval. */
const PENDING: [string, string][] = [
  ['u-you', 'u-teddy'],
  ['u-milo', 'u-luz'],
  ['u-sable', 'u-teddy'],
]

export const USERS: User[] = USER_SEEDS.map((s) => {
  const { joinedDaysAgo, ...rest } = s
  return {
    ...rest,
    avatarPhoto: null,
    followingIds: FOLLOWS.filter(([a]) => a === s.id).map(([, b]) => b),
    followerIds: FOLLOWS.filter(([, b]) => b === s.id).map(([a]) => a),
    pendingFollowingIds: PENDING.filter(([a]) => a === s.id).map(([, b]) => b),
    pendingFollowerIds: PENDING.filter(([, b]) => b === s.id).map(([a]) => a),
    joinedAt: new Date(NOW - joinedDaysAgo * DAY).toISOString(),
  }
})

/* ----------------------------------------------------------------- ratings */

/** Baseline quality per room; ratings jitter around it so the board is stable. */
const VENUE_BIAS: Record<string, number> = {
  'v-the-lodge': 4.7, 'v-aria': 4.6, 'v-wynn': 4.6, 'v-bellagio': 4.4, 'v-seminole-hr': 4.5,
  'v-borgata': 4.4, 'v-commerce': 4.2, 'v-tch-dallas': 4.5, 'v-red-rock': 4.3, 'v-south-point': 4.3,
  'v-encore-boston': 4.2, 'v-venetian': 4.1, 'v-bike': 4.0, 'v-hustler': 4.2, 'v-parx': 4.0,
  'v-maryland-live': 3.9, 'v-talking-stick': 4.0, 'v-choctaw': 4.1, 'v-winstar': 3.8,
  'v-rivers-des-plaines': 3.9, 'v-hawaiian-gardens': 3.8, 'v-champions-social': 4.1,
  'v-thunder-valley': 3.9, 'v-muckleshoot': 3.5, 'v-wind-creek': 3.8, 'v-rivers-philly': 3.7,
  'v-horseshoe-hammond': 3.6, 'v-pbkc': 3.7, 'v-ocean-ac': 3.5, 'v-pompano': 3.4,
  'v-hollywood-park': 3.5, 'v-orleans': 3.7, 'v-horseshoe-lv': 3.1, 'v-resorts-world': 3.4,
}

const HIGH_LINES = [
  'Floor got me seated in under ten minutes on a Saturday. That alone puts it ahead of everything else nearby.',
  'Dealers are fast and they actually correct mistakes before the pot ships. You feel it in hands per hour.',
  'Game ran deep all night and nobody was in a hurry to leave. Best table I have had in months.',
  'The rate they give back is real money if you put in volume. I logged it for a month and it checked out.',
  'Chairs, air, lighting, food at the table. Little things, but you notice them at hour nine.',
  'Every dealer knew the house rules the same way, which sounds trivial until you play somewhere it is not true.',
  'Tournament structure is genuinely playable — 30 minute levels and you start with real chips.',
]
const MID_LINES = [
  'Solid room, nothing surprising. Games run, dealers are fine, rake is what it is.',
  'Weekends are great, weekdays are a ghost town. Check the list before you drive out.',
  'Perfectly good place to put in hours. It just does not do anything better than the room down the road.',
  'The main game is soft but the list moves slowly once you get past midnight.',
  'Comps are okay, food is okay, dealers are okay. It all averages out to fine.',
  'Room is dated but clean, and the players make up for the decor.',
]
const LOW_LINES = [
  'Rake plus jackpot drop at these stakes is not beatable. I ran the numbers and stopped coming.',
  'Waited over an hour with three names ahead of me and nobody would give a straight answer.',
  'Dealers were slow and two different ones misread the board in the same session.',
  'The room is stuck in a corner next to the slots and it is loud enough to be a problem.',
  'Only one game running and they broke it at 11pm. Long drive for that.',
  'Floor decisions were inconsistent across two staff members on the same rule.',
]
const CONTEXT_LINES = [
  'Played a Friday night session, about six hours.',
  'Two-day trip, mostly afternoons.',
  'Stopped in on a weekday morning.',
  'Weekend series stop, so take the traffic with a grain of salt.',
  'Regular here — this is a hundred-plus session opinion, not a one-off.',
  'First visit, in town for work.',
]

function clamp5(x: number) { return Math.max(1, Math.min(5, x)) }

function makeSubscores(base: number): Subscores {
  const j = () => clamp5(Math.round((base + range(-0.9, 0.9)) * 2) / 2)
  return {
    gameQuality: j(), tableAvailability: j(), dealers: j(),
    comps: j(), atmosphere: j(), value: j(),
  }
}

function reviewText(overall: number): string {
  const body = overall >= 4.2 ? pick(HIGH_LINES) : overall >= 3.3 ? pick(MID_LINES) : pick(LOW_LINES)
  return `${pick(CONTEXT_LINES)} ${body}`
}

const raters = USERS.map((u) => u.id)

export const RATINGS: Rating[] = (() => {
  const out: Rating[] = []
  let n = 0
  for (const v of VENUES) {
    const base = VENUE_BIAS[v.id] ?? 3.8
    // Marquee rooms accumulate more reviews than regional ones.
    const count = int(base >= 4.3 ? 6 : 3, base >= 4.3 ? 11 : 8)
    const shuffled = [...raters].sort(() => rnd() - 0.5).slice(0, count)
    for (const uid of shuffled) {
      const overall = clamp5(Math.round((base + range(-0.7, 0.6)) * 2) / 2)
      out.push({
        id: `r-${++n}`,
        userId: uid,
        venueId: v.id,
        overall,
        subscores: makeSubscores(overall),
        review: reviewText(overall),
        stakesPlayed: pick(v.stakes),
        createdAt: ago(int(2, 160 * 24)),
      })
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
})()

/* ------------------------------------------------------------------- posts */

const TEXT_POSTS: { authorId: string; body: string; venueId: string | null; tags: string[]; hoursAgo: number }[] = [
  { authorId: 'u-marisol', body: 'Reminder that "10% to $5" and "10% to $4 plus a dollar jackpot" are the same rake wearing different hats. Read the placard, not the marketing.', venueId: null, tags: ['rake', 'psa'], hoursAgo: 3 },
  { authorId: 'u-june', body: 'Room 27 of 40 on the tour is in the bag. Ranking video drops Thursday and the top three are going to annoy some people.', venueId: 'v-the-lodge', tags: ['tour', 'vlog'], hoursAgo: 7 },
  { authorId: 'u-dez', body: 'Dealer PSA: if you tip a dollar a pot you are not being cheap, you are being normal. If you tip nothing for four hours we do notice, and so does everyone at the table.', venueId: 'v-commerce', tags: ['dealers'], hoursAgo: 11 },
  { authorId: 'u-priya', body: 'Structure sheet posted 45 minutes before cards in the air is not a structure sheet, it is a rumor. Publish them a week out.', venueId: 'v-borgata', tags: ['tournaments', 'structure'], hoursAgo: 16 },
  { authorId: 'u-omar', body: 'We read the reviews here. Two of you called out the waitlist board being wrong on weekends — new display goes in Tuesday. Keep them coming.', venueId: 'v-parx', tags: ['floor'], hoursAgo: 22 },
  { authorId: 'u-cassie', body: 'Unpopular: a $5/$5 PLO game with a $1500 cap is a better game than an uncapped $2/$5 NLHE. Fight me in the comments, I will be at the table.', venueId: 'v-seminole-hr', tags: ['plo'], hoursAgo: 27 },
  { authorId: 'u-hank', body: 'Twelve years of $4/$8 mornings and today a guy asked me if limit poker was "a new format." I am fossilized.', venueId: 'v-orleans', tags: ['limit'], hoursAgo: 33 },
  { authorId: 'u-nina', body: 'Day 1C drew 1,410. That is a record for this stop and the field is still 40% locals. The circuit is healthier than the doom posting suggests.', venueId: 'v-choctaw', tags: ['circuit', 'reporting'], hoursAgo: 40 },
  { authorId: 'u-grant', body: 'Half my students’ leaks are room selection, not strategy. You cannot solve your way out of a bad lineup and a $6 rake.', venueId: null, tags: ['coaching'], hoursAgo: 48 },
  { authorId: 'u-milo', body: 'Drove two hours for a $1/$3 that broke twenty minutes after I sat. Rating it accordingly and I have no regrets about the drive.', venueId: 'v-horseshoe-hammond', tags: ['roadtrip'], hoursAgo: 55 },
  { authorId: 'u-sable', body: 'Rooms: your wifi is part of the product now. Half my chat could not load the stream last night and that is a real review category.', venueId: 'v-hustler', tags: ['streaming'], hoursAgo: 62 },
  { authorId: 'u-marisol', body: 'Best $2/$5 lineups in Vegas right now, in order: Aria, Wynn, Bellagio, Venetian. Anyone telling you the Strip is dead has not looked at a list after 9pm.', venueId: 'v-aria', tags: ['vegas', 'cash'], hoursAgo: 70 },
  { authorId: 'u-june', body: 'Filmed a full session at a no-rake membership club and then the same stakes at a 10%-to-$5 room. The hourly gap is not close. Numbers in the video.', venueId: 'v-tch-dallas', tags: ['rake', 'texas'], hoursAgo: 84 },
  { authorId: 'u-dez', body: 'Somebody asked why our list moves slower on Sundays. It is because we run the tournament out of the same box. Now you know.', venueId: 'v-commerce', tags: ['floor'], hoursAgo: 96 },
  { authorId: 'u-priya', body: 'Made Day 2 with 38 big blinds and a plan. That is all you get to control.', venueId: 'v-maryland-live', tags: ['tournaments'], hoursAgo: 110 },
  { authorId: 'u-nina', body: 'A room that publishes its rake, its structures, and its jackpot math without being asked is telling you something about how it runs everything else.', venueId: null, tags: ['transparency'], hoursAgo: 128 },
  { authorId: 'u-cassie', body: 'Bomb pot every orbit is not a game, it is a raffle. Once an hour is perfect. This is the correct opinion.', venueId: 'v-the-lodge', tags: ['plo', 'bombpots'], hoursAgo: 140 },
  { authorId: 'u-grant', body: 'If a room’s $1/$3 is soft but its $2/$5 is a shark tank, that is a room with no middle. Look at the whole ladder before you call it good.', venueId: 'v-venetian', tags: ['coaching', 'cash'], hoursAgo: 155 },
]

const SESSION_POSTS: { authorId: string; venueId: string; body: string; stakes: string; hours: number; net: number; hoursAgo: number }[] = [
  { authorId: 'u-marisol', venueId: 'v-wynn', body: 'Long one. Table broke twice and both replacements were better than the original, which never happens.', stakes: '$2/$5 NLHE', hours: 9.5, net: 2340, hoursAgo: 5 },
  { authorId: 'u-milo', venueId: 'v-rivers-des-plaines', body: 'Ran into the top of every range. The game was great, I was not.', stakes: '$1/$2 NLHE', hours: 6, net: -410, hoursAgo: 19 },
  { authorId: 'u-cassie', venueId: 'v-seminole-hr', body: 'Four-hour PLO session that felt like twenty minutes. Straddle on, action deep.', stakes: '$5/$10 PLO', hours: 4, net: 5120, hoursAgo: 30 },
  { authorId: 'u-hank', venueId: 'v-orleans', body: 'Morning limit, same seat, same regulars. Up a rack and a half and home by noon.', stakes: '$4/$8 Limit', hours: 5, net: 148, hoursAgo: 44 },
  { authorId: 'u-sable', venueId: 'v-hustler', body: 'Streamed the whole thing. Lost a 300bb pot on camera, which is content, technically.', stakes: '$5/$5 NLHE', hours: 7, net: -1650, hoursAgo: 58 },
  { authorId: 'u-june', venueId: 'v-tch-dallas', body: 'No rake, seat time only. Broke even at the table and still came out ahead of a raked session.', stakes: '$2/$5 NLHE', hours: 8, net: 60, hoursAgo: 90 },
  { authorId: 'u-grant', venueId: 'v-bellagio', body: 'Short session between lessons. Table was tough and I was happy to book a small one.', stakes: '$5/$10 NLHE', hours: 3, net: 890, hoursAgo: 118 },
  { authorId: 'u-you', venueId: 'v-aria', body: 'First real session since making this account. Nervous, folded too much, still ahead.', stakes: '$1/$3 NLHE', hours: 4.5, net: 220, hoursAgo: 26 },
]


/* ------------------------------------------------------------ demo media */

/**
 * Seeded attachments are inline SVG data URIs — a few hundred bytes each, so
 * they live happily in the localStorage document and need no blob store. Real
 * uploads take the IndexedDB path instead (see lib/media.ts).
 */
function demoImage(id: string, alt: string, from: string, to: string, glyph: string): MediaItem {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>` +
    `</linearGradient></defs>` +
    `<rect width="800" height="600" fill="url(#g)"/>` +
    `<text x="400" y="330" font-size="200" text-anchor="middle">${glyph}</text>` +
    `</svg>`
  return {
    id,
    kind: 'image',
    mime: 'image/svg+xml',
    dataUri: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    width: 800,
    height: 600,
    durationSec: null,
    posterUri: null,
    byteSize: svg.length,
    alt,
  }
}

/** Post body text -> the attachments that post should carry. */
const SEED_MEDIA: Record<string, MediaItem[]> = {
  'u-june': [
    demoImage('m-seed-1', 'The Lodge main room, tables full on a Friday night', '#0D1117', '#3B82F6', '\u{1F0CF}'),
    demoImage('m-seed-2', 'The tour van parked outside the club', '#8B949E', '#0D1117', '\u{1F690}'),
  ],
  'u-cassie': [
    demoImage('m-seed-3', 'A four-way all-in pot in PLO, chips stacked in the middle', '#3B82F6', '#8B949E', '\u{1F3B4}'),
  ],
  'u-milo': [
    demoImage('m-seed-4', 'Empty table after the game broke', '#0D1117', '#8B949E', '\u{1FA91}'),
  ],
}

export const POSTS: Post[] = (() => {
  const out: Post[] = []
  let n = 0
  // Each author's seeded media goes on their most recent post, once.
  const unclaimed = new Set(Object.keys(SEED_MEDIA))
  const takeSeedMedia = (authorId: string): MediaItem[] => {
    if (!unclaimed.has(authorId)) return []
    unclaimed.delete(authorId)
    return SEED_MEDIA[authorId]
  }
  const likers = (max: number) => {
    const pool = [...raters].sort(() => rnd() - 0.5)
    return pool.slice(0, int(0, max))
  }

  for (const t of TEXT_POSTS) {
    out.push({
      id: `p-${++n}`, authorId: t.authorId, kind: 'text', body: t.body,
      venueId: t.venueId, ratingId: null, session: null,
      media: takeSeedMedia(t.authorId), tags: t.tags,
      createdAt: ago(t.hoursAgo), likedBy: likers(11),
    })
  }
  for (const s of SESSION_POSTS) {
    out.push({
      id: `p-${++n}`, authorId: s.authorId, kind: 'session', body: s.body,
      venueId: s.venueId, ratingId: null,
      session: { stakes: s.stakes, hours: s.hours, net: s.net },
      media: [], tags: ['session'], createdAt: ago(s.hoursAgo), likedBy: likers(9),
    })
  }
  // Surface the most recent ratings as feed posts so reviews and the feed agree.
  for (const r of RATINGS.slice(0, 26)) {
    const v = VENUES.find((x) => x.id === r.venueId)!
    out.push({
      id: `p-${++n}`, authorId: r.userId, kind: 'rating',
      body: `Rated ${v.name} ${r.overall.toFixed(1)}/5. ${r.review}`,
      venueId: r.venueId, ratingId: r.id, session: null, media: [],
      tags: ['rating', v.city.toLowerCase().replace(/\s+/g, '-')],
      createdAt: r.createdAt, likedBy: likers(7),
    })
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
})()

/* ---------------------------------------------------------------- comments */

const COMMENT_LINES = [
  'This matches my experience exactly.',
  'Strong disagree, but I respect the write-up.',
  'Which night were you there? Weekends are a completely different room.',
  'Finally someone said it.',
  'The rake number here is the part people keep ignoring.',
  'Adding this to my list for next trip.',
  'Was this before or after the remodel?',
  'The floor staff there have always been great to me.',
  'I had the opposite experience on a Tuesday, for what it is worth.',
  'Screenshotting this for the group chat.',
  'How long was the wait when you got there?',
  'Underrated room, glad it is getting attention.',
]

export const COMMENTS: Comment[] = (() => {
  const out: Comment[] = []
  let n = 0
  for (const p of POSTS) {
    const howMany = int(0, p.kind === 'text' ? 4 : 3)
    for (let i = 0; i < howMany; i++) {
      const author = pick(raters.filter((id) => id !== p.authorId))
      out.push({
        id: `c-${++n}`, postId: p.id, authorId: author,
        body: pick(COMMENT_LINES),
        createdAt: new Date(Date.parse(p.createdAt) + int(5, 600) * 60_000).toISOString(),
        likedBy: [...raters].sort(() => rnd() - 0.5).slice(0, int(0, 4)),
      })
    }
  }
  return out
})()

/* ------------------------------------------------------------------- lists */

export const LISTS: VenueList[] = [
  { id: 'l-1', ownerId: 'u-marisol', name: 'Vegas $2/$5, ranked', description: 'Every Strip and locals room I have played this year, in the order I would send a friend to them.', venueIds: ['v-aria', 'v-wynn', 'v-bellagio', 'v-venetian', 'v-red-rock', 'v-south-point', 'v-resorts-world'], isPublic: true, emoji: '🎰', createdAt: ago(300), updatedAt: ago(20) },
  { id: 'l-2', ownerId: 'u-june', name: '40-Room US Tour', description: 'The full route. Rated as I go, no skipping the bad ones.', venueIds: ['v-the-lodge', 'v-tch-dallas', 'v-champions-social', 'v-winstar', 'v-choctaw', 'v-commerce', 'v-bike', 'v-hustler', 'v-seminole-hr', 'v-borgata'], isPublic: true, emoji: '🚐', createdAt: ago(900), updatedAt: ago(8) },
  { id: 'l-3', ownerId: 'u-cassie', name: 'Real PLO Games Only', description: 'Rooms that actually spread $5/$5 pot limit with a list, not a "we can start one if you find five people."', venueIds: ['v-seminole-hr', 'v-the-lodge', 'v-hustler', 'v-maryland-live', 'v-borgata', 'v-winstar'], isPublic: true, emoji: '🃏', createdAt: ago(600), updatedAt: ago(46) },
  { id: 'l-4', ownerId: 'u-priya', name: 'Structures Worth Flying For', description: 'Tournament stops where the structure is not an insult. Private until I finish the schedule.', venueIds: ['v-borgata', 'v-choctaw', 'v-maryland-live', 'v-wind-creek', 'v-parx'], isPublic: false, emoji: '🏆', createdAt: ago(500), updatedAt: ago(60) },
  { id: 'l-5', ownerId: 'u-hank', name: 'Limit Games That Still Exist', description: 'An endangered species list.', venueIds: ['v-orleans', 'v-south-point', 'v-commerce', 'v-muckleshoot', 'v-talking-stick'], isPublic: true, emoji: '🦕', createdAt: ago(700), updatedAt: ago(140) },
  { id: 'l-6', ownerId: 'u-you', name: 'Want to Play', description: 'Rooms I have not been to yet. Working through it one trip at a time.', venueIds: ['v-the-lodge', 'v-commerce', 'v-borgata', 'v-seminole-hr'], isPublic: false, emoji: '📌', createdAt: ago(200), updatedAt: ago(26) },
  { id: 'l-7', ownerId: 'u-milo', name: 'Drivable from Chicago', description: 'Under four hours, worth the gas.', venueIds: ['v-rivers-des-plaines', 'v-horseshoe-hammond', 'v-parx'], isPublic: true, emoji: '🚗', createdAt: ago(150), updatedAt: ago(30) },
  { id: 'l-8', ownerId: 'u-dez', name: 'Rooms That Treat Dealers Well', description: 'Toke pools, breaks on time, and floors who back you up.', venueIds: ['v-commerce', 'v-bike', 'v-hollywood-park', 'v-hawaiian-gardens', 'v-wynn'], isPublic: true, emoji: '🤝', createdAt: ago(400), updatedAt: ago(72) },
]
