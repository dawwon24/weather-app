export interface Place {
  name: string;
  detail: string; // e.g. "서울특별시 강남구"
  lat: number;
  lon: number;
}

/** Provincial capitals and metropolitan cities — used for the Korea map and instant search hits. */
export const KOREA_CITIES: (Place & { short: string })[] = [
  { short: '서울', name: '서울특별시', detail: '대한민국', lat: 37.5665, lon: 126.978 },
  { short: '인천', name: '인천광역시', detail: '대한민국', lat: 37.4563, lon: 126.7052 },
  { short: '수원', name: '수원시', detail: '경기도', lat: 37.2636, lon: 127.0286 },
  { short: '춘천', name: '춘천시', detail: '강원특별자치도', lat: 37.8813, lon: 127.7298 },
  { short: '강릉', name: '강릉시', detail: '강원특별자치도', lat: 37.7519, lon: 128.8761 },
  { short: '청주', name: '청주시', detail: '충청북도', lat: 36.6424, lon: 127.489 },
  { short: '세종', name: '세종특별자치시', detail: '대한민국', lat: 36.48, lon: 127.289 },
  { short: '대전', name: '대전광역시', detail: '대한민국', lat: 36.3504, lon: 127.3845 },
  { short: '홍성', name: '홍성군', detail: '충청남도', lat: 36.6013, lon: 126.6608 },
  { short: '안동', name: '안동시', detail: '경상북도', lat: 36.5684, lon: 128.7294 },
  { short: '전주', name: '전주시', detail: '전북특별자치도', lat: 35.8242, lon: 127.148 },
  { short: '대구', name: '대구광역시', detail: '대한민국', lat: 35.8714, lon: 128.6014 },
  { short: '울산', name: '울산광역시', detail: '대한민국', lat: 35.5384, lon: 129.3114 },
  { short: '광주', name: '광주광역시', detail: '대한민국', lat: 35.1595, lon: 126.8526 },
  { short: '창원', name: '창원시', detail: '경상남도', lat: 35.2281, lon: 128.6811 },
  { short: '부산', name: '부산광역시', detail: '대한민국', lat: 35.1796, lon: 129.0756 },
  { short: '목포', name: '목포시', detail: '전라남도', lat: 34.8118, lon: 126.3922 },
  { short: '여수', name: '여수시', detail: '전라남도', lat: 34.7604, lon: 127.6622 },
  { short: '제주', name: '제주시', detail: '제주특별자치도', lat: 33.4996, lon: 126.5312 },
  { short: '서귀포', name: '서귀포시', detail: '제주특별자치도', lat: 33.2541, lon: 126.56 },
  { short: '울릉', name: '울릉군', detail: '경상북도', lat: 37.4844, lon: 130.9058 },
];
