import {
	FeatureRunner,
	ConsoleReporter,
	awsSdkStepRunners,
	storageStepRunners,
} from '@bifravst/e2e-bdd-test-runner'
import * as chalk from 'chalk'
import { IoTClient } from '@aws-sdk/client-iot'
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts'
import { firmwareCIStepRunners } from './steps/firmwareCI'
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

	const iot = new IoTClient(testEnvSDKConfig)

	const world = {
		region: region,
		accountId: accountId as string,
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
