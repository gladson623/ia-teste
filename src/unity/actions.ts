export interface MoveToAction {
  action: "move_to";
  payload: {
    target: string;
  };
}

export interface PickUpAction {
  action: "pick_up";
  payload: {
    object: string;
  };
}

export interface DropAction {
  action: "drop";
  payload: {
    object: string;
    location?: string;
  };
}

export interface SpeakAction {
  action: "speak";
  payload: {
    text: string;
  };
}

export type UnityAction = MoveToAction | PickUpAction | DropAction | SpeakAction;
