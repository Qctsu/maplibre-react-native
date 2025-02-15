import {
  forwardRef,
  memo,
  type ReactNode,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import { Annotation } from "./Annotation";
import { CircleLayer } from "./CircleLayer";
import { HeadingIndicator } from "./HeadingIndicator";
import { NativeUserLocation } from "./NativeUserLocation";
import {
  type Location,
  LocationManager,
} from "../modules/location/LocationManager";
import { type CircleLayerStyle } from "../types/MapLibreRNStyles";

const mapboxBlue = "rgba(51, 181, 229, 100)";

const layerStyles: Record<string, CircleLayerStyle> = {
  pluse: {
    circleRadius: 15,
    circleColor: mapboxBlue,
    circleOpacity: 0.2,
    circlePitchAlignment: "map",
  },
  background: {
    circleRadius: 9,
    circleColor: "#fff",
    circlePitchAlignment: "map",
  },
  foreground: {
    circleRadius: 6,
    circleColor: mapboxBlue,
    circlePitchAlignment: "map",
  },
};

export const normalIcon = (
    showsUserHeadingIndicator?: boolean,
    heading?: number,
) => [
  <CircleLayer
      key="mapboxUserLocationPluseCircle"
      id="mapboxUserLocationPluseCircle"
      style={layerStyles.pluse}
  />,
  <CircleLayer
      key="mapboxUserLocationWhiteCircle"
      id="mapboxUserLocationWhiteCircle"
      style={layerStyles.background}
  />,
  <CircleLayer
      key="mapboxUserLocationBlueCicle"
      id="mapboxUserLocationBlueCicle"
      aboveLayerID="mapboxUserLocationWhiteCircle"
      style={layerStyles.foreground}
  />,
  ...(showsUserHeadingIndicator && heading
      ? [HeadingIndicator({ heading })]
      : []),
];

interface UserLocationProps {
  /**
   * Whether location icon is animated between updates
   */
  animated?: boolean;
  /**
   * Which render mode to use.
   * Can either be `normal` or `native`
   */
  renderMode?: "normal" | "native";
  /**
   * native/android only render mode
   *
   *  - normal: just a circle
   *  - compass: triangle with heading
   *  - gps: large arrow
   *
   * @platform android
   */
  androidRenderMode?: "normal" | "compass" | "gps";
  /**
   * Whether location icon is visible
   */
  visible?: boolean;
  /**
   * Callback that is triggered on location icon press
   */
  onPress?(): void;
  /**
   * Callback that is triggered on location update
   */
  onUpdate?(location: Location): void;
  /**
   * Show or hide small arrow which indicates direction the device is pointing relative to north.
   */
  showsUserHeadingIndicator?: boolean;
  /**
   * Minimum amount of movement before GPS location is updated in meters
   */
  minDisplacement?: number;
  /**
   * Android only. Set max FPS at which location animators can output updates. Use this setting to limit animation rate of the location puck on higher zoom levels to decrease the stress on the device's CPU which can directly improve battery life, without sacrificing UX.
   *
   * @platform android
   */
  androidPreferredFramesPerSecond?: number;
  /**
   * Custom location icon of type mapbox-gl-native components
   *
   * NOTE: Forking maintainer does not understand the above comment.
   */
  children?: ReactNode;
  /**
   * Jeśli chcesz pominąć wewnętrzny LocationManager i podać własne współrzędne zewnętrzne
   * (np. z expo-location), możesz je przekazać tym polem.
   * Po ustawieniu, komponent przestaje uruchamiać nasłuchiwanie z LocationManagera.
   */
  externalUserLocation?: {
    coords: {
      latitude: number;
      longitude: number;
      heading?: number;
      speed?: number;
      accuracy?: number;
    };
    timestamp?: number;
  };
}

interface UserLocationState {
  shouldShowUserLocation: boolean;
  coordinates?: number[];
  heading?: number;
}

export enum UserLocationRenderMode {
  Native = "native",
  Normal = "normal",
}

export interface UserLocationRef {
  setLocationManager: (props: { running: boolean }) => Promise<void>;
  needsLocationManagerRunning: () => boolean;
  _onLocationUpdate: (location: Location | null) => void;
}

export const UserLocation = memo(
    forwardRef<UserLocationRef, UserLocationProps>(
        (
            {
              animated = true,
              visible = true,
              showsUserHeadingIndicator = false,
              minDisplacement = 0,
              renderMode = "normal",
              androidRenderMode,
              androidPreferredFramesPerSecond,
              children,
              onUpdate,
              onPress,
              externalUserLocation,
            }: UserLocationProps,
            ref,
        ) => {
          const _isMounted = useRef<boolean>(false);
          const locationManagerRunning = useRef<boolean>(false);

          const [userLocationState, setUserLocationState] =
              useState<UserLocationState>({
                shouldShowUserLocation: false,
              });

          // -- Imperative handle (API):
          useImperativeHandle(
              ref,
              (): UserLocationRef => ({
                /**
                 * Czy uruchomić / zatrzymać nasłuchiwanie LocationManagera
                 */
                setLocationManager,
                /**
                 * If LocationManager should be running
                 */
                needsLocationManagerRunning,
                _onLocationUpdate,
              }),
          );

          // -- Główny efekt: reaguje na kluczowe propsy.
          useEffect(() => {
            if (!_isMounted.current) return;

            if (externalUserLocation) {
              // Jeśli korzystamy z zewnętrznej lokalizacji, wyłącz menedżera
              setLocationManager({ running: false });
            } else {
              // W przeciwnym razie, normalnie steruj menedżerem
              setLocationManager({
                running: needsLocationManagerRunning(),
              });
            }
          }, [visible, onUpdate, renderMode, externalUserLocation]);

          // -- Montowanie/odmontowanie: start + stop manager, ustaw minDisplacement
          useEffect(() => {
            _isMounted.current = true;

            // Przy montowaniu: jednorazowe ustawienie menedżera
            setLocationManager({
              running: needsLocationManagerRunning(),
            }).then(() => {
              if (renderMode === UserLocationRenderMode.Native) {
                return;
              }
              // Ustaw minimalny dystans, ale tylko na starcie
              LocationManager.setMinDisplacement(minDisplacement ?? 0);
            });

            // Przy odmontowaniu: wyłącz menedżera
            return () => {
              _isMounted.current = false;
              setLocationManager({ running: false });
            };
            // eslint-disable-next-line react-hooks/exhaustive-deps
          }, []);

          // -- Efekt: jeśli minDisplacement się zmieni, podmień w natywnym managerze
          useEffect(() => {
            // Zadziała też przy mount, ale to nie szkodzi
            LocationManager.setMinDisplacement(minDisplacement ?? 0);
          }, [minDisplacement]);

          // -------------------------------------------
          // Implementacja metod:
          // -------------------------------------------
          async function setLocationManager({
                                              running,
                                            }: {
            running: boolean;
          }): Promise<void> {
            if (locationManagerRunning.current !== running) {
              locationManagerRunning.current = running;

              if (running) {
                LocationManager.addListener(_onLocationUpdate);
                const location = await LocationManager.getLastKnownLocation();
                _onLocationUpdate(location);
              } else {
                LocationManager.removeListener(_onLocationUpdate);
              }
            }
          }

          function needsLocationManagerRunning(): boolean {
            // Normalny warunek: onUpdate lub widoczny marker w trybie 'Normal'
            return !!(
                !!onUpdate ||
                (renderMode === UserLocationRenderMode.Normal && visible)
            );
          }

          function _onLocationUpdate(location: Location | null): void {
            if (!_isMounted.current) {
              return;
            }

            // Jeśli mamy zewnętrzną lokalizację, używamy jej zamiast wewnętrznej
            const usedLocation = externalUserLocation ?? location;
            if (!usedLocation?.coords) {
              return;
            }

            const { longitude, latitude, heading } = usedLocation.coords;
            const coordinates = [longitude, latitude];

            setUserLocationState((prev) => ({
              ...prev,
              coordinates,
              heading,
            }));

            if (onUpdate) {
              // Wywołujemy onUpdate z danymi z 'usedLocation'
              onUpdate(usedLocation);
            }
          }

          // -------------------------------------------
          // Render:
          // -------------------------------------------
          if (!visible) {
            return null;
          }

          // Tryb NATYWNY
          if (renderMode === UserLocationRenderMode.Native) {
            const nativeProps = {
              androidRenderMode,
              iosShowsUserHeadingIndicator: showsUserHeadingIndicator,
              androidPreferredFramesPerSecond,
            };
            return <NativeUserLocation {...nativeProps} />;
          }

          // Tryb 'normal' + brak coordinates -> nic nie pokazujemy
          if (!userLocationState.coordinates) {
            return null;
          }

          return (
              <Annotation
                  animated={animated}
                  id="mapboxUserLocation"
                  onPress={onPress}
                  coordinates={userLocationState.coordinates}
                  style={{
                    iconRotate: userLocationState.heading,
                  }}
              >
                {children ||
                    normalIcon(
                        showsUserHeadingIndicator,
                        userLocationState.heading
                    )}
              </Annotation>
          );
        },
    ),
);
