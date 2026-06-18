const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'telemetry-ingestion',
  brokers: (process.env.KAFKA_BROKERS || 'kafka:9092').split(','),
});

const producer = kafka.producer();

async function connect() {
  await producer.connect();
  console.log('[Kafka Producer] Connected');
}

async function publish(topic, message) {
  await producer.send({
    topic,
    messages: [{ key: message.deviceSerial, value: JSON.stringify(message) }],
  });
}

module.exports = { connect, publish };
