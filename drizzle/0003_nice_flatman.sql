ALTER TABLE `individuals` ADD `external_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `individuals_external_id_unique` ON `individuals` (`external_id`);
--> statement-breakpoint
INSERT INTO `classes` (`name`, `description`) VALUES
  ('Sensor', 'A physical or simulated source that emits observable events.'),
  ('Event', 'An immutable observation or action recorded by the workspace runtime.'),
  ('Rule', 'An approved deterministic condition that can trigger a device action.'),
  ('Device', 'A physical or virtual actuator controlled through the workspace adapter.'),
  ('Room', 'A physical workspace containing sensors and devices.');
--> statement-breakpoint
INSERT INTO `properties` (`name`, `domain_class_id`, `range_class_id`, `description`) VALUES
  ('emits', (SELECT `id` FROM `classes` WHERE `name` = 'Sensor'), (SELECT `id` FROM `classes` WHERE `name` = 'Event'), 'Connects a sensor to the events it emits.'),
  ('evaluatedBy', (SELECT `id` FROM `classes` WHERE `name` = 'Event'), (SELECT `id` FROM `classes` WHERE `name` = 'Rule'), 'Connects a sensor event to the deterministic rule that evaluates it.'),
  ('triggers', (SELECT `id` FROM `classes` WHERE `name` = 'Rule'), (SELECT `id` FROM `classes` WHERE `name` = 'Device'), 'Connects a matched rule to the device it triggers.'),
  ('sensorLocatedIn', (SELECT `id` FROM `classes` WHERE `name` = 'Sensor'), (SELECT `id` FROM `classes` WHERE `name` = 'Room'), 'Locates a sensor in a room.'),
  ('deviceLocatedIn', (SELECT `id` FROM `classes` WHERE `name` = 'Device'), (SELECT `id` FROM `classes` WHERE `name` = 'Room'), 'Locates a device in a room.');
--> statement-breakpoint
INSERT INTO `individuals` (`name`, `class_id`, `description`, `external_id`) VALUES
  ('TemperatureSensor01', (SELECT `id` FROM `classes` WHERE `name` = 'Sensor'), 'The workspace temperature sensor, currently provided by the active adapter.', 'temperature-01'),
  ('LightSensor01', (SELECT `id` FROM `classes` WHERE `name` = 'Sensor'), 'The workspace ambient light sensor.', 'light-01'),
  ('DistanceSensor01', (SELECT `id` FROM `classes` WHERE `name` = 'Sensor'), 'The workspace proximity sensor.', 'distance-01'),
  ('ButtonSensor01', (SELECT `id` FROM `classes` WHERE `name` = 'Sensor'), 'The workspace button input.', 'button-01'),
  ('Led01', (SELECT `id` FROM `classes` WHERE `name` = 'Device'), 'A controllable workspace LED.', 'led-01'),
  ('Servo01', (SELECT `id` FROM `classes` WHERE `name` = 'Device'), 'A controllable workspace servo.', 'servo-01'),
  ('Buzzer01', (SELECT `id` FROM `classes` WHERE `name` = 'Device'), 'A controllable workspace buzzer.', 'buzzer-01'),
  ('FanRelay01', (SELECT `id` FROM `classes` WHERE `name` = 'Device'), 'A relay representing the workspace cooling fan.', 'relay-fan-01'),
  ('DemoRoom', (SELECT `id` FROM `classes` WHERE `name` = 'Room'), 'The simulated physical workspace.' , 'room-demo-01'),
  ('SensorReadingEvent', (SELECT `id` FROM `classes` WHERE `name` = 'Event'), 'The semantic concept represented by runtime sensor.reading events.', NULL),
  ('WorkspaceAutomationRule', (SELECT `id` FROM `classes` WHERE `name` = 'Rule'), 'An approved rule evaluated by the deterministic runtime.', NULL);
--> statement-breakpoint
INSERT INTO `relations` (`subject_id`, `property_id`, `object_id`)
SELECT s.`id`, p.`id`, r.`id` FROM `individuals` s, `properties` p, `individuals` r
WHERE s.`name` IN ('TemperatureSensor01', 'LightSensor01', 'DistanceSensor01', 'ButtonSensor01') AND p.`name` = 'sensorLocatedIn' AND r.`name` = 'DemoRoom';
--> statement-breakpoint
INSERT INTO `relations` (`subject_id`, `property_id`, `object_id`)
SELECT d.`id`, p.`id`, r.`id` FROM `individuals` d, `properties` p, `individuals` r
WHERE d.`name` IN ('Led01', 'Servo01', 'Buzzer01', 'FanRelay01') AND p.`name` = 'deviceLocatedIn' AND r.`name` = 'DemoRoom';
--> statement-breakpoint
INSERT INTO `relations` (`subject_id`, `property_id`, `object_id`) VALUES
  ((SELECT `id` FROM `individuals` WHERE `name` = 'TemperatureSensor01'), (SELECT `id` FROM `properties` WHERE `name` = 'emits'), (SELECT `id` FROM `individuals` WHERE `name` = 'SensorReadingEvent')),
  ((SELECT `id` FROM `individuals` WHERE `name` = 'SensorReadingEvent'), (SELECT `id` FROM `properties` WHERE `name` = 'evaluatedBy'), (SELECT `id` FROM `individuals` WHERE `name` = 'WorkspaceAutomationRule')),
  ((SELECT `id` FROM `individuals` WHERE `name` = 'WorkspaceAutomationRule'), (SELECT `id` FROM `properties` WHERE `name` = 'triggers'), (SELECT `id` FROM `individuals` WHERE `name` = 'FanRelay01'));
--> statement-breakpoint
PRAGMA optimize;
