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

    const params = event.queryStringParameters || {};
    let body = {};
    try {
      if (event.body) body = JSON.parse(event.body);
    } catch (e) {}
    const action = params.action || body.action;

    // === リセット要求の場合: mail_events を全件削除 ===
    if (action === 'reset') {
      if (db) {
        const snap = await db.collection('mail_events').limit(1000).get();
        const deletePromises = [];
        snap.forEach(doc => deletePromises.push(doc.ref.delete()));
        await Promise.all(deletePromises);
        console.log(`[get-campaign-stats] mail_events 全 ${deletePromises.length} 件をリセット（削除）しました`);
      }
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, no-cache, must-revalidate'
        },
        body: JSON.stringify({
          ok: true,
          message: '成果レポートのイベントデータを全て0に初期化しました',
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

    // 重複を排除したユニーク集計用Set
    const uniqueOpenedCids = new Set();
    const uniqueClickedCids = new Set();
    const uniqueBookedCids = new Set();

    const channelStats = {
      email: { opens: new Set(), clicks: new Set(), bookings: 0 },
      line: { opens: new Set(), clicks: new Set(), bookings: 0 }
    };
    const logsStats = {};
    const planCounts = {};
    const planRevenues = {};
    let totalRevenue = 0;

    const allEvents = [];
    if (db) {
      const eventsSnap = await db.collection('mail_events').limit(1000).get();

      eventsSnap.forEach(doc => {
        const data = doc.data();
        allEvents.push({ id: doc.id, ...data });
        const type = data.type; // 'open' | 'click' | 'booking'
        const cid = (data.cid || 'anonymous').trim().toLowerCase();
        const channel = data.channel === 'line' ? 'line' : 'email';
        const plan = data.plan || 'normal';
        const logId = data.logId || 'default';

        if (!logsStats[logId]) {
          logsStats[logId] = {
            opensSet: new Set(),
            clicksSet: new Set(),
            bookings: 0,
            revenue: 0
          };
        }

        if (type === 'open') {
          uniqueOpenedCids.add(cid);
          channelStats[channel].opens.add(cid);
          logsStats[logId].opensSet.add(cid);
        } else if (type === 'click') {
          uniqueClickedCids.add(cid);
          channelStats[channel].clicks.add(cid);
          logsStats[logId].clicksSet.add(cid);
        } else if (type === 'booking') {
          uniqueBookedCids.add(cid);
          channelStats[channel].bookings++;
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

    // ログ別サマリーのSetを数値に変換
    const formattedLogsStats = {};
    Object.keys(logsStats).forEach(lId => {
      formattedLogsStats[lId] = {
        opens: logsStats[lId].opensSet.size,
        clicks: logsStats[lId].clicksSet.size,
        bookings: logsStats[lId].bookings,
        revenue: logsStats[lId].revenue
      };
    });

    const formattedChannelStats = {
      email: {
        opens: channelStats.email.opens.size,
        clicks: channelStats.email.clicks.size,
        bookings: channelStats.email.bookings
      },
      line: {
        opens: channelStats.line.opens.size,
        clicks: channelStats.line.clicks.size,
        bookings: channelStats.line.bookings
      }
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate'
      },
      body: JSON.stringify({
        ok: true,
        stats: {
          totalOpens: uniqueOpenedCids.size,
          totalClicks: uniqueClickedCids.size,
          totalBookings: uniqueBookedCids.size,
          totalRevenue,
          planCounts,
          planRevenues,
          channelStats: formattedChannelStats,
          logsStats: formattedLogsStats
        },
        debugEvents: allEvents
      })
    };
  } catch (err) {
    console.error('[get-campaign-stats] エラー:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
};
