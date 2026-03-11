const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BADGE_DEFS = {
  prophet:       { icon: '🔮', description: '5 wins in a row' },
  village_idiot: { icon: '🃏', description: '5 losses in a row' },
  degen:         { icon: '🎰', description: 'Bet on 10+ markets' },
  whale:         { icon: '🐋', description: 'Single bet of 500+ points' },
  first_blood:   { icon: '🩸', description: 'First bet ever' },
};

async function awardBadge(userId, name) {
  try {
    await prisma.badge.upsert({
      where: { userId_name: { userId, name } },
      create: {
        userId,
        name,
        icon: BADGE_DEFS[name].icon,
        description: BADGE_DEFS[name].description,
      },
      update: {},
    });
  } catch (e) {
    // Silently skip duplicate badges
  }
}

async function checkAndAwardBadges(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      bets: {
        include: { market: { select: { status: true, outcome: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!user) return;

  // first_blood: placed at least one bet
  if (user.bets.length >= 1) {
    await awardBadge(userId, 'first_blood');
  }

  // degen: bet on 10+ distinct markets
  const uniqueMarkets = new Set(user.bets.map((b) => b.marketId));
  if (uniqueMarkets.size >= 10) {
    await awardBadge(userId, 'degen');
  }

  // whale: any single bet >= 500
  if (user.bets.some((b) => b.amount >= 500)) {
    await awardBadge(userId, 'whale');
  }

  // prophet: current winning streak >= 5
  if (user.currentStreak >= 5) {
    await awardBadge(userId, 'prophet');
  }

  // village_idiot: 5 consecutive losses at the end of resolved bets
  const resolvedBets = user.bets.filter((b) => b.market.status === 'RESOLVED');
  let lossStreak = 0;
  for (let i = resolvedBets.length - 1; i >= 0; i--) {
    if (resolvedBets[i].payout === 0) lossStreak++;
    else break;
  }
  if (lossStreak >= 5) {
    await awardBadge(userId, 'village_idiot');
  }
}

module.exports = { checkAndAwardBadges };
