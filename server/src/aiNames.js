/**
 * AI NAME GENERATOR
 *
 * Generates random Adjective + Noun names for AI players.
 * Names are fun, PG, and persist only for the duration of one game.
 */

const ADJECTIVES = [
  'Amber', 'Azure', 'Blazing', 'Bouncy', 'Bubbly', 'Bumbling', 'Breezy',
  'Candid', 'Cheerful', 'Cobalt', 'Cozy', 'Crimson', 'Crystal', 'Curly',
  'Dapper', 'Dazzling', 'Dizzy', 'Dreamy',
  'Emerald', 'Ethereal',
  'Fancy', 'Fizzy', 'Fluffy', 'Frosty', 'Fuzzy',
  'Gallant', 'Giddy', 'Gilded', 'Gleaming', 'Glowing', 'Golden',
  'Hazy', 'Hoppy', 'Hushed',
  'Icy', 'Indigo',
  'Jaunty', 'Jazzy', 'Jolly', 'Jovial',
  'Lanky', 'Lavender', 'Leafy', 'Lively', 'Lofty', 'Lunar',
  'Mellow', 'Mighty', 'Minty', 'Misty', 'Mossy',
  'Nifty', 'Nimble', 'Noble',
  'Perky', 'Peppy', 'Plucky', 'Plum', 'Prancing', 'Prismatic', 'Pudgy',
  'Radiant', 'Rosy', 'Rowdy', 'Royal', 'Rugged', 'Rustic',
  'Sassy', 'Shiny', 'Silver', 'Sleek', 'Sleepy', 'Snappy', 'Snazzy', 'Solar',
  'Speedy', 'Spiky', 'Spunky', 'Starry', 'Stormy', 'Sunny',
  'Tangy', 'Teal', 'Tiny', 'Topaz', 'Twinkly',
  'Velvet', 'Vivid',
  'Wandering', 'Whimsical', 'Wiggly', 'Wispy', 'Wobbly', 'Wondrous',
  'Zany', 'Zesty', 'Zippy',
]

const NOUNS = [
  'Alpaca', 'Armadillo', 'Axolotl',
  'Badger', 'Beetle', 'Bison', 'Blobfish', 'Bunny',
  'Capybara', 'Caterpillar', 'Chameleon', 'Chipmunk', 'Crab', 'Crane',
  'Dodo', 'Dolphin', 'Dragon', 'Dragonfly', 'Duck',
  'Elephant', 'Elk',
  'Flamingo', 'Fox', 'Frog',
  'Gecko', 'Giraffe', 'Gnome', 'Goblin', 'Goose', 'Griffin',
  'Hamster', 'Hedgehog', 'Hippo', 'Hummingbird',
  'Ibis', 'Iguana',
  'Jackalope', 'Jellyfish',
  'Kangaroo', 'Kiwi', 'Koala',
  'Lemur', 'Llama', 'Lobster',
  'Mammoth', 'Marmot', 'Meerkat', 'Mole', 'Moth',
  'Narwhal', 'Newt', 'Nightingale',
  'Octopus', 'Otter', 'Owl',
  'Pangolin', 'Parrot', 'Peacock', 'Penguin', 'Phoenix', 'Platypus', 'Puffin',
  'Quail', 'Quokka',
  'Raccoon', 'Raven',
  'Salamander', 'Seahorse', 'Sloth', 'Snail', 'Sphinx', 'Squirrel',
  'Tapir', 'Toucan', 'Treefrog', 'Turtle',
  'Unicorn',
  'Walrus', 'Weasel', 'Wombat',
  'Yeti',
  'Zebra',
]

export function generateAIName() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]
  return `${adj} ${noun}`
}
