let getDb = null;
let admin = null;
try {
  const fb = require('./_lib-endo/firebase-admin');
  getDb = fb.getDb;
  admin = fb.admin;
} catch (e1) {
  try {
    const fb = require('./_lib/firebase-admin');
    getDb = fb.getDb;
    admin = fb.admin;
  } catch (e2) {}
}

const PLANS = {
  normal: { name: '【1泊2食付】通常プラン', price: 18000 },
  lastminute: { name: '【1泊2食付】直前割プラン', price: 15000 },
  bbq: { name: '特製ジンギスカンコース', price: 16500 },
  hp: { name: '公式HP基本プラン', price: 14000 }
};

exports.handler = async (event) => {
  try {
    let db = null;
    try {
      if (getDb) db = getDb();
    } catch (e) {}

    let totalOpens = 0;
    let totalClicks = 0;
    let totalBookings = 0;
    let totalRevenue = 0;
    const planCounts = {};
    const planRevenues = {};
    const channelStats = { email: { opens: 0, clicks: 0, bookings: 0 }, line: { opens: 0, clicks: 0, bookings: 0 } };
    const logsStats = {};

    const allEvents = [];
    if (db) {
      // 1. mail_events コレクションから開封・クリック・予約履歴を全件取得
      const eventsSnap = await db.collection('mail_events').limit(1000).get();

      eventsSnap.forEach(doc => {
        const data = doc.data();
        allEvents.push({ id: doc.id, ...data });
        const type = data.type; // 'open' or 'click' or 'booking'
        const channel = data.channel || 'email';
        const plan = data.plan || 'normal';
        const logId = data.logId || 'default';

        if (!logsStats[logId]) {
          logsStats[logId] = { opens: 0, clicks: 0, bookings: 0, revenue: 0 };
        }

        if (type === 'open') {
          totalOpens++;
          if (channelStats[channel]) channelStats[channel].opens++;
          logsStats[logId].opens++;
        } else if (type === 'click') {
          totalClicks++;
          if (channelStats[channel]) channelStats[channel].clicks++;
          logsStats[logId].clicks++;
        } else if (type === 'booking') {
          totalBookings++;
          if (channelStats[channel]) channelStats[channel].bookings++;
          logsStats[logId].bookings++;

          const pInfo = PLANS[plan] || PLANS.normal;
          const pName = pInfo.name;
          const pPrice = Number(data.amount) || pInfo.price;
          planCounts[pName] = (planCounts[pName] || 0) + 1;
          planRevenues[pName] = (planRevenues[pName] || 0) + pPrice;
          totalRevenue += pPrice;
          logsStats[logId].revenue += pPrice;
        }
      });
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate'
      },
      body: JSON.stringify({
        ok: true,
        stats: {
          totalOpens,
          totalClicks,
          totalBookings,
          totalRevenue,
          planCounts,
          planRevenues,
          channelStats,
          logsStats
        },
        debugEvents: allEvents
      })
    };
  } catch (err) {
    console.error('[get-campaign-stats] エラー:', err);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        stats: {
          totalOpens: 0,
          totalClicks: 0,
          totalBookings: 0,
          totalRevenue: 0,
          planCounts: {},
          planRevenues: {},
          channelStats: { email: { opens: 0, clicks: 0, bookings: 0 }, line: { opens: 0, clicks: 0, bookings: 0 } },
          logsStats: {}
        }
      })
    };
  }
};
