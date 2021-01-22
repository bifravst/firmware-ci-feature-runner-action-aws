import {
	FeatureRunner,
	ConsoleReporter,
	awsSdkStepRunners,
	storageStepRunners,
} from '@bifravst/e2e-bdd-test-runner'
import * as chalk from 'chalk'
import { bifravstStepRunners, certsDir } from '@bifravst/aws'
import { IoTClient } from '@aws-sdk/client-iot'
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts'
import { firmwareCIStepRunners } from './steps/firmwareCI'
import { downloadDeviceCredentials } from './lib/downloadDeviceCredentials'
import { getInput } from '@actions/core'

const getRequiredInput = (input: string): string =>
	getInput(input, { required: true })

const jobId = getRequiredInput('job id')
const accessKeyId = getRequiredInput('aws access key id')
const secretAccessKey = getRequiredInput('aws secret access key')
const region = getRequiredInput('aws region')
const mqttEndpoint = getRequiredInput('broker hostname')
const stackName = getRequiredInput('stack name')
const appVersion = getRequiredInput('app version')
const featureDir = getRequiredInput('feature dir')

const testEnvSDKConfig = {
	region,
	credentials: {
		accessKeyId,
		secretAccessKey,
	},
}

const main = async () => {
	const { Account: accountId } = await new STSClient(testEnvSDKConfig).send(
		new GetCallerIdentityCommand({}),
	)

	const c = await certsDir({
		iotEndpoint: mqttEndpoint,
		accountId: accountId as string,
	})

	const iot = new IoTClient(testEnvSDKConfig)

	const world = {
		region: region,
		accountId: accountId as string,
		awsIotRootCA: `-----BEGIN CERTIFICATE-----
		MIIDQTCCAimgAwIBAgITBmyfz5m/jAo54vB4ikPmljZbyjANBgkqhkiG9w0BAQsF
		ADA5MQswCQYDVQQGEwJVUzEPMA0GA1UEChMGQW1hem9uMRkwFwYDVQQDExBBbWF6
		b24gUm9vdCBDQSAxMB4XDTE1MDUyNjAwMDAwMFoXDTM4MDExNzAwMDAwMFowOTEL
		MAkGA1UEBhMCVVMxDzANBgNVBAoTBkFtYXpvbjEZMBcGA1UEAxMQQW1hem9uIFJv
		b3QgQ0EgMTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBALJ4gHHKeNXj
		ca9HgFB0fW7Y14h29Jlo91ghYPl0hAEvrAIthtOgQ3pOsqTQNroBvo3bSMgHFzZM
		9O6II8c+6zf1tRn4SWiw3te5djgdYZ6k/oI2peVKVuRF4fn9tBb6dNqcmzU5L/qw
		IFAGbHrQgLKm+a/sRxmPUDgH3KKHOVj4utWp+UhnMJbulHheb4mjUcAwhmahRWa6
		VOujw5H5SNz/0egwLX0tdHA114gk957EWW67c4cX8jJGKLhD+rcdqsq08p8kDi1L
		93FcXmn/6pUCyziKrlA4b9v7LWIbxcceVOF34GfID5yHI9Y/QCB/IIDEgEw+OyQm
		jgSubJrIqg0CAwEAAaNCMEAwDwYDVR0TAQH/BAUwAwEB/zAOBgNVHQ8BAf8EBAMC
		AYYwHQYDVR0OBBYEFIQYzIU07LwMlJQuCFmcx7IQTgoIMA0GCSqGSIb3DQEBCwUA
		A4IBAQCY8jdaQZChGsV2USggNiMOruYou6r4lK5IpDB/G/wkjUu0yKGX9rbxenDI
		U5PMCCjjmCXPI6T53iHTfIUJrU6adTrCC2qJeHZERxhlbI1Bjjt/msv0tadQ1wUs
		N+gDS63pYaACbvXy8MWy7Vu33PqUXHeeE6V/Uq2V8viTO96LXFvKWlJbYK8U90vv
		o/ufQJVtMVT8QtPHRh8jrdkPSHCa2XV4cdFyQzR1bldZwgJcJmApzyMZFo6IQ6XU
		5MsI+yMRQ+hDKXJioaldXgjUkK642M4UwtBV8ob2xJNDd2ZhwLnoQdeXeGADbkpy
		rqXRfboQnoZsG4q5WTP468SQvvG5
		-----END CERTIFICATE-----`,
		certsDir: c,
		mqttEndpoint,
		stackName,
		jobId,
		awsAccessKeyId: accessKeyId,
		awsSecretAccessKey: secretAccessKey,
		appVersion,
	}

	console.log(chalk.yellow.bold(' World:'))
	console.log()
	console.log(world)
	console.log()

	await downloadDeviceCredentials({
		certsDir: c,
		deviceId: jobId,
		iot,
		brokerHostname: mqttEndpoint,
	})
	console.log()

	const runner = new FeatureRunner<typeof world>(world, {
		dir: featureDir,
		reporters: [
			new ConsoleReporter({
				printResults: true,
				printProgress: true,
				printSummary: true,
			}),
		],
		retry: false,
	})

	try {
		const { success } = await runner
			.addStepRunners(
				firmwareCIStepRunners({
					iot,
				}),
			)
			.addStepRunners(
				awsSdkStepRunners({
					constructorArgs: {
						IotData: {
							endpoint: world.mqttEndpoint,
						},
					},
				}),
			)
			.addStepRunners(bifravstStepRunners(world))
			.addStepRunners(storageStepRunners())
			.run()
		if (!success) {
			process.exit(1)
		}
		process.exit()
	} catch (error) {
		console.error(chalk.red('Running the features failed!'))
		console.error(error)
		process.exit(1)
	}
}

void main()
