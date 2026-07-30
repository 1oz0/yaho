import { ApiProperty } from '@nestjs/swagger';

import { STOP_TYPES } from '../../common/constants/reward';

export const MAP_MARKER_KINDS = ['DESTINATION', 'STOP'] as const;

export class LatLngDto {
  @ApiProperty({ type: Number, example: 34.6417, description: '위도 (WGS84)' })
  latitude!: number;

  @ApiProperty({ type: Number, example: 126.7672, description: '경도 (WGS84)' })
  longitude!: number;
}

export class MapBoundsDto {
  @ApiProperty({ type: Number, description: '북쪽 끝 위도' })
  north!: number;

  @ApiProperty({ type: Number, description: '남쪽 끝 위도' })
  south!: number;

  @ApiProperty({ type: Number, description: '동쪽 끝 경도' })
  east!: number;

  @ApiProperty({ type: Number, description: '서쪽 끝 경도' })
  west!: number;
}

export class MapViewportDto {
  @ApiProperty({
    type: MapBoundsDto,
    nullable: true,
    description:
      '모든 마커를 감싸는 경계 상자. 마커가 없으면 null. ' +
      '카카오맵 `map.setBounds()`, Leaflet `fitBounds()` 에 바로 넣을 수 있습니다.',
  })
  bounds!: MapBoundsDto | null;

  @ApiProperty({
    type: LatLngDto,
    nullable: true,
    description:
      '지도 중심. **마커 좌표의 평균이 아니라 경계 상자의 중심**입니다 — ' +
      '마커가 한쪽에 몰려도 외곽 마커가 화면 밖으로 밀리지 않습니다.',
  })
  center!: LatLngDto | null;
}

export class DestinationMarkerDto {
  @ApiProperty({ type: String, description: 'TravelDestination ID' })
  id!: string;

  @ApiProperty({ type: String, example: 'GANGJIN' })
  code!: string;

  @ApiProperty({ type: String, example: '강진' })
  name!: string;

  @ApiProperty({ type: String, example: '전라남도' })
  province!: string;

  @ApiProperty({ type: String })
  tagline!: string;

  @ApiProperty({ type: Number })
  latitude!: number;

  @ApiProperty({ type: Number })
  longitude!: number;

  @ApiProperty({ type: String, example: '소멸고위험' })
  riskGrade!: string;

  @ApiProperty({ type: Number, description: '이 여행지를 열려면 필요한 절약액 (원)' })
  targetSavingAmount!: number;

  @ApiProperty({
    type: Boolean,
    description: '`false` 면 아직 절약액이 부족한 곳입니다. 마커를 흐리게 처리하세요.',
  })
  unlocked!: boolean;

  @ApiProperty({
    type: Number,
    description: '잠긴 여행지에서 더 아껴야 하는 금액(원). 이미 열렸으면 0.',
  })
  shortfallAmount!: number;

  @ApiProperty({ type: Number, description: '등록된 루트 수 (보통 2)' })
  routeCount!: number;

  @ApiProperty({
    type: Boolean,
    description: '이 여행지에 대해 생성해 둔 AI 코스가 있는가. 있으면 지도에서 바로 열 수 있습니다.',
  })
  hasAiCourse!: boolean;
}

export class TravelMapDto {
  @ApiProperty({ type: MapViewportDto })
  viewport!: MapViewportDto;

  @ApiProperty({ type: [DestinationMarkerDto], description: '여행지 마커. 잠긴 곳도 포함됩니다.' })
  destinations!: DestinationMarkerDto[];

  @ApiProperty({ type: Number, description: '절약액으로 갈 수 있는 여행지 수' })
  unlockedCount!: number;

  @ApiProperty({
    type: Number,
    description: '좌표가 없어 지도에서 제외된 여행지 수. 정상 상태에서는 0입니다.',
  })
  missingCoordinateCount!: number;

  @ApiProperty({ type: Number, description: '지도의 기준 절약액 (원)' })
  basisSavedAmount!: number;

  @ApiProperty({
    type: String,
    enum: ['CHALLENGE', 'SAVING_GOAL', 'NONE'],
    description: '기준 절약액의 출처. `/travel/prescriptions` 와 동일한 규칙을 씁니다.',
  })
  basisSource!: string;
}

export class RouteMapStopDto {
  @ApiProperty({ type: Number, description: '1부터. 지도 마커의 번호로 그대로 쓰세요.' })
  sortOrder!: number;

  @ApiProperty({ type: String })
  placeName!: string;

  @ApiProperty({ type: String, enum: STOP_TYPES, description: '마커 아이콘을 고르는 데 씁니다.' })
  stopType!: string;

  @ApiProperty({ type: Number })
  latitude!: number;

  @ApiProperty({ type: Number })
  longitude!: number;

  @ApiProperty({ type: Number, description: '체류 시간(분)' })
  stayMinutes!: number;

  @ApiProperty({ type: Number, description: '예상 비용 (원)' })
  estimatedAmount!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'AI 코스일 때만 채워지는 도착 예정 시각 (HH:MM). 시드 루트 지도에서는 null.',
  })
  arrivalTime!: string | null;
}

export class RouteLegDto {
  @ApiProperty({ type: Number })
  fromSortOrder!: number;

  @ApiProperty({ type: Number })
  toSortOrder!: number;

  @ApiProperty({ type: String })
  fromPlaceName!: string;

  @ApiProperty({ type: String })
  toPlaceName!: string;

  @ApiProperty({
    type: Number,
    description: '**직선거리(km)** 입니다. 도로 주행거리가 아니며 실제로는 20~40% 더 깁니다.',
  })
  distanceKm!: number;
}

export class RouteMapDto {
  @ApiProperty({ type: String, description: 'TravelRoute ID 또는 AiTravelCourse ID' })
  id!: string;

  @ApiProperty({
    type: String,
    enum: ['SEED_ROUTE', 'AI_COURSE'],
    description: '`SEED_ROUTE` = 미리 준비된 루트 / `AI_COURSE` = Claude 가 짠 코스',
  })
  kind!: string;

  @ApiProperty({ type: String })
  title!: string;

  @ApiProperty({ type: String, description: 'TravelDestination ID' })
  destinationId!: string;

  @ApiProperty({ type: String, example: '강진' })
  destinationName!: string;

  @ApiProperty({ type: MapViewportDto })
  viewport!: MapViewportDto;

  @ApiProperty({
    type: [RouteMapStopDto],
    description: '방문 순서대로. 이 순서로 이으면 그것이 곧 폴리라인입니다.',
  })
  stops!: RouteMapStopDto[];

  @ApiProperty({ type: [RouteLegDto], description: '인접 경유지 사이의 구간. 경유지 n개면 n-1개.' })
  legs!: RouteLegDto[];

  @ApiProperty({ type: Number, description: '구간 직선거리의 합 (km)' })
  totalDistanceKm!: number;

  @ApiProperty({ type: Number, description: '경유지 예상 비용의 합 (원)' })
  totalEstimatedAmount!: number;

  @ApiProperty({
    type: Number,
    description: '좌표가 없어 지도에서 제외된 경유지 수. 정상 상태에서는 0입니다.',
  })
  missingCoordinateCount!: number;
}
