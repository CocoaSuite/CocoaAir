const ADJECTIVES = [
  'Amber', 'Quiet', 'Calm', 'Swift', 'Bright', 'Gentle', 'Bold', 'Clever', 'Lucky', 'Brave',
  'Silver', 'Golden', 'Misty', 'Sunny', 'Rapid', 'Steady', 'Cosy', 'Merry', 'Nimble', 'Proud',
  'Witty', 'Mellow', 'Crisp', 'Lively', 'Noble', 'Polar', 'Rustic', 'Velvet', 'Coral', 'Jade',
];

const ANIMALS = [
  'Falcon', 'Heron', 'Lynx', 'Otter', 'Fox', 'Panda', 'Koala', 'Badger', 'Robin', 'Dolphin',
  'Raven', 'Tiger', 'Puffin', 'Hare', 'Beaver', 'Owl', 'Seal', 'Wren', 'Bison', 'Gecko',
  'Marten', 'Ibis', 'Lemur', 'Moose', 'Orca', 'Quail', 'Stoat', 'Toucan', 'Walrus', 'Yak',
];

export function randomName(random: () => number = Math.random): string {
  const pick = (list: string[]) => list[Math.floor(random() * list.length)] ?? list[0]!;
  return `${pick(ADJECTIVES)} ${pick(ANIMALS)}`;
}
