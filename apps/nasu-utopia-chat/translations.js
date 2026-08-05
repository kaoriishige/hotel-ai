const translations = {
    ja: {
        heroTitle: "「ととのう」の、その先へ。",
        heroDesc: "旧美野沢小学校をリノベーションしたアート＆サウナリゾート。<br>コンクリートサウナCUBERU、薪サウナRekka、那須連山の水風呂、手ぶらBBQなど、極上の体験をご案内いたします。",
        navOnsen: "サウナ＆水風呂",
        navDining: "手ぶらBBQ・お食事",
        navFacilities: "ヴィラ・校舎アート",
        navSightseeing: "那須高原周辺観光"
    },
    en: {
        heroTitle: "Beyond Totonou Feeling.",
        heroDesc: "An art & sauna resort renovated from the former Minosawa Elementary School.<br>Enjoy concrete sauna CUBERU, firewood sauna Rekka, Mount Nasu cold plunge, and hands-free BBQ.",
        navOnsen: "Sauna & Cold Plunge",
        navDining: "BBQ & Dining",
        navFacilities: "Villas & School Art",
        navSightseeing: "Nasu Sightseeing"
    },
    zh: {
        heroTitle: "超越极致桑拿体验",
        heroDesc: "由旧美野泽小学改建的艺术与桑拿度假村。<br>提供混凝土桑拿CUBERU、柴火桑拿Rekka、那须连山冷水浴及烧烤套餐。",
        navOnsen: "桑拿与冷水浴",
        navDining: "BBQ与美食",
        navFacilities: "别墅与校舍艺术",
        navSightseeing: "那须高原观光"
    },
    ko: {
        heroTitle: "사우나, 그 이상의 감動",
        heroDesc: "구 미노사와 초등학교를 リノベーション한 아트 & 사우나 리조트.<br>콘크리트 사우나 CUBERU, 장작 사우나 Rekka, 나스 연봉의 냉수욕, BBQ를 즐겨보세요.",
        navOnsen: "사우나 & 냉수욕",
        navDining: "BBQ & 식사",
        navFacilities: "빌라 & 아트 갤러리",
        navSightseeing: "나스 고원 관광"
    }
};

function changeLanguage(lang) {
    const t = translations[lang] || translations['ja'];
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (t[key]) {
            el.innerHTML = t[key];
        }
    });
}
