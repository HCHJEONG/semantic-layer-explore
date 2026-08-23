create table if not exists semantic_classes (
  id bigserial primary key,
  name text not null unique,
  description text not null
);

create table if not exists semantic_properties (
  id bigserial primary key,
  name text not null unique,
  domain_class_id bigint not null references semantic_classes(id),
  range_class_id bigint not null references semantic_classes(id),
  description text not null
);

create table if not exists semantic_individuals (
  id bigserial primary key,
  name text not null unique,
  class_id bigint not null references semantic_classes(id),
  description text not null,
  external_id text unique
);

create table if not exists semantic_relations (
  id bigserial primary key,
  subject_id bigint not null references semantic_individuals(id),
  property_id bigint not null references semantic_properties(id),
  object_id bigint not null references semantic_individuals(id),
  unique (subject_id, property_id, object_id)
);

create index if not exists idx_semantic_properties_domain_class_id on semantic_properties(domain_class_id);
create index if not exists idx_semantic_individuals_class_id on semantic_individuals(class_id);
create index if not exists idx_semantic_relations_subject_property on semantic_relations(subject_id, property_id);
create index if not exists idx_semantic_relations_object_property on semantic_relations(object_id, property_id);

create table if not exists graph_projection_status (
  projection_name text primary key,
  status text not null,
  rebuild_id text,
  requested_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  node_count integer not null default 0,
  relation_count integer not null default 0,
  error_message text,
  updated_at timestamptz not null default now()
);

insert into graph_projection_status (projection_name, status)
values ('ontology', 'not_built') on conflict (projection_name) do nothing;

insert into semantic_classes (name, description) values
  ('Person', 'A human actor who can work for a company or participate in a project.'),
  ('Company', 'An organization that can employ people.'),
  ('Project', 'A defined body of work to which people can be assigned.'),
  ('Sensor', 'A physical or simulated source that emits observable events.'),
  ('Event', 'An immutable observation or action recorded by the workspace runtime.'),
  ('Rule', 'An approved deterministic condition that can trigger a device action.'),
  ('Device', 'A physical or virtual actuator controlled through the workspace adapter.'),
  ('Room', 'A physical workspace containing sensors and devices.')
on conflict (name) do nothing;

insert into semantic_properties (name, domain_class_id, range_class_id, description)
select source.name, domain_class.id, range_class.id, source.description
from (values
  ('worksFor', 'Person', 'Company', 'Connects a person to the company they work for.'),
  ('assignedTo', 'Person', 'Project', 'Connects a person to a project they are assigned to.'),
  ('emits', 'Sensor', 'Event', 'Connects a sensor to the events it emits.'),
  ('evaluatedBy', 'Event', 'Rule', 'Connects a sensor event to the deterministic rule that evaluates it.'),
  ('triggers', 'Rule', 'Device', 'Connects a matched rule to the device it triggers.'),
  ('sensorLocatedIn', 'Sensor', 'Room', 'Locates a sensor in a room.'),
  ('deviceLocatedIn', 'Device', 'Room', 'Locates a device in a room.')
) as source(name, domain_name, range_name, description)
join semantic_classes domain_class on domain_class.name = source.domain_name
join semantic_classes range_class on range_class.name = source.range_name
on conflict (name) do nothing;

insert into semantic_individuals (name, class_id, description, external_id)
select source.name, class.id, source.description, source.external_id
from (values
  ('InspectionTeam', 'Person', 'An operations team responsible for monitoring the BestAiCom smart workspace.', null),
  ('OpsEngineer', 'Person', 'An engineer assigned to automation review and workspace operations.', null),
  ('BestAiCom', 'Company', 'The company operating the semantic workspace portfolio.', null),
  ('BestAiCom Smart Workspace', 'Project', 'A project that demonstrates semantic operations intelligence.', null),
  ('TemperatureSensor01', 'Sensor', 'The workspace temperature sensor, currently provided by the active adapter.', 'temperature-01'),
  ('LightSensor01', 'Sensor', 'The workspace ambient light sensor.', 'light-01'),
  ('DistanceSensor01', 'Sensor', 'The workspace proximity sensor.', 'distance-01'),
  ('ButtonSensor01', 'Sensor', 'The workspace button input.', 'button-01'),
  ('Led01', 'Device', 'A controllable workspace LED.', 'led-01'),
  ('Servo01', 'Device', 'A controllable workspace servo.', 'servo-01'),
  ('Buzzer01', 'Device', 'A controllable workspace buzzer.', 'buzzer-01'),
  ('FanRelay01', 'Device', 'A relay representing the workspace cooling fan.', 'relay-fan-01'),
  ('DemoRoom', 'Room', 'The simulated physical workspace.', 'room-demo-01'),
  ('SensorReadingEvent', 'Event', 'The semantic concept represented by runtime sensor.reading events.', null),
  ('WorkspaceAutomationRule', 'Rule', 'An approved rule evaluated by the deterministic runtime.', null)
) as source(name, class_name, description, external_id)
join semantic_classes class on class.name = source.class_name
on conflict (name) do nothing;

insert into semantic_relations (subject_id, property_id, object_id)
select subject.id, property.id, object.id
from (values
  ('InspectionTeam', 'worksFor', 'BestAiCom'),
  ('OpsEngineer', 'worksFor', 'BestAiCom'),
  ('OpsEngineer', 'assignedTo', 'BestAiCom Smart Workspace'),
  ('TemperatureSensor01', 'sensorLocatedIn', 'DemoRoom'),
  ('LightSensor01', 'sensorLocatedIn', 'DemoRoom'),
  ('DistanceSensor01', 'sensorLocatedIn', 'DemoRoom'),
  ('ButtonSensor01', 'sensorLocatedIn', 'DemoRoom'),
  ('Led01', 'deviceLocatedIn', 'DemoRoom'),
  ('Servo01', 'deviceLocatedIn', 'DemoRoom'),
  ('Buzzer01', 'deviceLocatedIn', 'DemoRoom'),
  ('FanRelay01', 'deviceLocatedIn', 'DemoRoom'),
  ('TemperatureSensor01', 'emits', 'SensorReadingEvent'),
  ('SensorReadingEvent', 'evaluatedBy', 'WorkspaceAutomationRule'),
  ('WorkspaceAutomationRule', 'triggers', 'FanRelay01')
) as source(subject_name, property_name, object_name)
join semantic_individuals subject on subject.name = source.subject_name
join semantic_properties property on property.name = source.property_name
join semantic_individuals object on object.name = source.object_name
on conflict (subject_id, property_id, object_id) do nothing;
