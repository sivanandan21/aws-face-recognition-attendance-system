pipeline {
    agent any

    environment {
        CI = 'true'
        PATH = "/usr/bin:/usr/local/bin:$PATH"
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Setup Dependencies') {
            steps {
                sh '''
                    echo "=== Setting up Python Virtual Environment & Dependencies ==="
                    python3 -m venv venv || true
                    . venv/bin/activate
                    pip install --upgrade pip
                    pip install -r edge-kiosk/requirements.txt
                    pip install -r aws-backend/handlers/requirements.txt
                    pip install pytest pytest-mock
                '''
            }
        }

        stage('Run Pytest Suite') {
            steps {
                sh '''
                    echo "=== Running 30 Automated Biometric & Cloud Tests ==="
                    . venv/bin/activate
                    pytest tests/ -v --tb=short
                '''
            }
        }

        stage('Build React Web Dashboard') {
            steps {
                dir('dashboard') {
                    sh '''
                        echo "=== Installing Frontend Dependencies & Building Vite App ==="
                        npm install
                        npm run build
                    '''
                }
            }
        }

        stage('Deploy / Reload Service') {
            steps {
                sh '''
                    echo "=== Deploying to Live Production & Restarting PM2 ==="
                    if [ -d "/home/ubuntu/aws-face-recognition-attendance-system" ]; then
                        sudo -u ubuntu bash -c 'cd /home/ubuntu/aws-face-recognition-attendance-system && git pull && pm2 restart attendance-dashboard' || true
                    else
                        pm2 restart attendance-dashboard || true
                    fi
                '''
            }
        }
    }

    post {
        success {
            echo "Pipeline succeeded! Smart Attendance application verified and deployed."
        }
        failure {
            echo "Pipeline failed! Please check console output for errors."
        }
    }
}
