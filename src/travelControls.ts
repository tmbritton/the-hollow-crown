export const initialTravelControl = { gait: 'walk', key: 'released' } as const;
type Gait = 'walk' | 'run';
type TravelControl = { gait: Gait; key: 'released' | 'held' };
type Event = { type: 'down'; repeat: boolean } | { type: 'up' | 'cancel' | 'input-lost' };

export function travelControl(state: TravelControl, event: Event): TravelControl {
  switch (event.type) {
    case 'input-lost':
      return initialTravelControl;
    case 'cancel':
      return { ...state, gait: 'walk' };
    case 'up':
      return { ...state, key: 'released' };
    case 'down':
      if (event.repeat || state.key === 'held') return state;
      return { gait: state.gait === 'walk' ? 'run' : 'walk', key: 'held' };
  }
}
